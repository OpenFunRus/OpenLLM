import type { AgentChatMessage } from '../../shared/agent/agentChatMessages'
import {
  buildSummaryInjectionMessage,
  estimateAgentMessagesTokens,
  mergeHistoryAfterSummary,
  serializeAgentSegmentForSummary,
  splitAgentHistoryForSummary,
  squeezeToolOutputsForSummary,
} from '../../shared/agent/contextSummarizer'
import { buildSummaryUserPrompt, SUMMARY_SYSTEM_PROMPT } from '../../shared/agent/summaryPrompts'
import type { AppSettings } from '../../shared/types'
import { contextKToTokens, MODEL_CONTEXT_DEFAULT_K } from '../../shared/modelConfig'
import { llmService } from '../services/LlmService'
import { modelRegistryService } from '../services/ModelRegistryService'
import { settingsService } from '../services/SettingsService'

export type SummarizeContextResult = {
  messages: AgentChatMessage[]
  summarized: boolean
}

function getSummarizeSettings(): Pick<
  AppSettings,
  | 'agentSummarizeEnabled'
  | 'agentSummarizeAtPercent'
  | 'agentSummarizeTargetRatio'
  | 'agentSummarizeKeepRecentTurns'
  | 'agentSummarizePreSqueeze'
  | 'agentSummarizeModelId'
  | 'activeModelId'
> {
  return {
    agentSummarizeEnabled: settingsService.get('agentSummarizeEnabled'),
    agentSummarizeAtPercent: settingsService.get('agentSummarizeAtPercent'),
    agentSummarizeTargetRatio: settingsService.get('agentSummarizeTargetRatio'),
    agentSummarizeKeepRecentTurns: settingsService.get('agentSummarizeKeepRecentTurns'),
    agentSummarizePreSqueeze: settingsService.get('agentSummarizePreSqueeze'),
    agentSummarizeModelId: settingsService.get('agentSummarizeModelId'),
    activeModelId: settingsService.get('activeModelId'),
  }
}

function getContextTokenBudget(): number {
  const activeId = settingsService.get('activeModelId')
  const model = activeId ? modelRegistryService.getById(activeId) : null
  return contextKToTokens(model?.contextSize ?? MODEL_CONTEXT_DEFAULT_K)
}

export function shouldSummarizeAgentHistory(
  messages: AgentChatMessage[],
  promptTokens?: number
): boolean {
  const settings = getSummarizeSettings()
  if (!settings.agentSummarizeEnabled) return false

  const total = getContextTokenBudget()
  if (total <= 0) return false

  const used = promptTokens ?? estimateAgentMessagesTokens(messages)
  const percent = (used / total) * 100
  if (percent < settings.agentSummarizeAtPercent) return false

  const { middle } = splitAgentHistoryForSummary(
    messages,
    settings.agentSummarizeKeepRecentTurns
  )
  return middle.length > 0
}

export async function trySummarizeAgentHistory(
  messages: AgentChatMessage[],
  promptTokens?: number
): Promise<SummarizeContextResult> {
  if (!shouldSummarizeAgentHistory(messages, promptTokens)) {
    return { messages, summarized: false }
  }

  const settings = getSummarizeSettings()
  const split = splitAgentHistoryForSummary(
    messages,
    settings.agentSummarizeKeepRecentTurns
  )
  if (split.middle.length === 0) {
    return { messages, summarized: false }
  }

  const middleForSummary = settings.agentSummarizePreSqueeze
    ? squeezeToolOutputsForSummary(split.middle)
    : split.middle

  const serialized = serializeAgentSegmentForSummary(middleForSummary)
  const userPrompt = buildSummaryUserPrompt(serialized, settings.agentSummarizeTargetRatio)

  try {
    const summaryMarkdown = await llmService.completeMessagesForSummary(
      SUMMARY_SYSTEM_PROMPT,
      userPrompt,
      settings.agentSummarizeModelId
    )
    const trimmed = summaryMarkdown.trim()
    if (!trimmed) return { messages, summarized: false }

    const summaryMessage = buildSummaryInjectionMessage(trimmed)
    const next = mergeHistoryAfterSummary(split.head, summaryMessage, split.tail)
    return { messages: next, summarized: true }
  } catch (err) {
    console.warn('[contextSummarizer] summary call failed:', err)
    return { messages, summarized: false }
  }
}
