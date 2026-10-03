import type { AgentStepEntry } from '@shared/agent/agentSteps'
import type { AgentToolEvent } from '@shared/agent/types'
import type { ChatMessage } from '@shared/types'
import { buildAgentStepsFromLegacy, flattenToolEvents } from '@shared/agent/agentSteps'
import { extractStreamActivity } from '@shared/agent/thinkingBlocks'
import { t } from '@shared/i18n'
import { AgentProseBlock } from './AgentProseBlock'
import { AgentToolBubble } from './AgentToolBubble'
import { ThinkingBlock } from './ThinkingBlock'
import styles from './ChatMessage.module.css'

interface Props {
  message: ChatMessage
  workspacePath?: string | null
  onImplementPlan?: (filePath: string, planName?: string) => void
}

type StreamFocus = 'thinking' | 'prose' | string | null

function isSupersededToolError(event: AgentToolEvent, allTools: AgentToolEvent[]): boolean {
  if (!event.isError || !event.filePath) return false
  if (event.name !== 'Write' && event.name !== 'StrReplace') return false
  return allTools.some(
    (other) =>
      other.toolId !== event.toolId &&
      other.filePath === event.filePath &&
      other.status === 'done' &&
      !other.isError &&
      (other.name === 'Write' || other.name === 'StrReplace')
  )
}

/** During stream: only one block stays expanded — latest pending tool, else live prose, else thinking. */
function resolveStreamFocus(
  isStreaming: boolean,
  liveThinking: string | null,
  liveProse: string | null,
  tools: AgentToolEvent[]
): StreamFocus {
  if (!isStreaming) return null
  const pending = [...tools].reverse().find((t) => t.status === 'pending')
  if (pending?.toolId) return pending.toolId
  if (liveProse?.trim()) return 'prose'
  if (liveThinking?.trim()) return 'thinking'
  return null
}

function renderInterleavedStep(
  step: AgentStepEntry,
  allTools: AgentToolEvent[],
  workspacePath: string | null | undefined,
  isStreaming: boolean,
  streamFocus: StreamFocus,
  liveProse: string | null | undefined,
  onImplementPlan?: (filePath: string, planName?: string) => void
): JSX.Element[] {
  const proseBlocks = step.proseBlocks ?? []
  const tools = step.tools.filter((ev) => !isSupersededToolError(ev, allTools))
  const hasCreatePlan = tools.some(
    (tool) => tool.name === 'CreatePlan' && tool.status === 'done' && !tool.isError
  )
  const nodes: JSX.Element[] = []

  if (tools.length === 0) {
    const text = proseBlocks[0]?.trim() || liveProse?.trim() || ''
    if (text || liveProse) {
      const proseLive = Boolean(isStreaming && liveProse?.trim() && !proseBlocks[0]?.trim())
      nodes.push(
        <AgentProseBlock
          key={`prose-${step.step}-0`}
          text={text}
          live={proseLive && streamFocus === 'prose'}
          workspacePath={workspacePath}
        />
      )
    }
    return nodes
  }

  tools.forEach((tool, index) => {
    const prose = proseBlocks[index]?.trim()
    if (prose) {
      nodes.push(
        <AgentProseBlock
          key={`prose-${step.step}-${index}`}
          text={prose}
          workspacePath={workspacePath}
        />
      )
    }
    const toolId = tool.toolId ?? `${step.step}-${tool.name}-${index}`
    nodes.push(
      <AgentToolBubble
        key={toolId}
        event={tool}
        workspacePath={workspacePath}
        isMessageStreaming={isStreaming}
        streamFocused={!isStreaming || streamFocus === toolId}
        onImplementPlan={onImplementPlan}
      />
    )
  })

  if (!hasCreatePlan) {
    const trailing = proseBlocks[tools.length]?.trim()
    if (trailing) {
      nodes.push(
        <AgentProseBlock
          key={`prose-${step.step}-tail`}
          text={trailing}
          workspacePath={workspacePath}
        />
      )
    } else if (liveProse?.trim()) {
      nodes.push(
        <AgentProseBlock
          key={`prose-${step.step}-live`}
          text={liveProse}
          live={isStreaming && streamFocus === 'prose'}
          workspacePath={workspacePath}
        />
      )
    }
  }

  return nodes
}

export function AgentStepsTimeline({ message, workspacePath, onImplementPlan }: Props): JSX.Element | null {
  const steps = message.agentSteps?.length
    ? message.agentSteps
    : buildAgentStepsFromLegacy(message.thinkingBlocks, message.toolEvents)

  const currentStep = message.streamingAgentStep
  const isStreaming = Boolean(message.isStreaming)
  const allTools = flattenToolEvents(steps)
  const liveProse = isStreaming ? message.agentProseBuffer : null

  const completedSteps: AgentStepEntry[] =
    isStreaming && currentStep ? steps.filter((s) => s.step < currentStep) : steps

  const activeStepEntry: AgentStepEntry | null =
    isStreaming && currentStep ? (steps.find((s) => s.step === currentStep) ?? null) : null

  const liveReasoning = isStreaming ? message.agentReasoningBuffer : null
  const liveLegacyThinking =
    isStreaming && message.agentStreamBuffer
      ? extractStreamActivity(message.agentStreamBuffer)
      : null
  const liveThinking = liveReasoning || liveLegacyThinking

  const activeTools = activeStepEntry?.tools ?? []
  const streamFocus = resolveStreamFocus(isStreaming, liveThinking, liveProse, activeTools)

  const showLiveGroup = isStreaming && Boolean(currentStep)
  const statusLine = message.agentStatusLine?.trim().replace(/^>\s*/, '')

  const hasAnything =
    completedSteps.length > 0 ||
    showLiveGroup ||
    Boolean(liveThinking) ||
    Boolean(liveProse?.trim()) ||
    Boolean(statusLine)

  if (!hasAnything) return null

  const stepThinking = activeStepEntry?.thinking ?? liveThinking ?? ''
  const thinkingLive = isStreaming && !activeStepEntry?.thinking && Boolean(liveThinking?.trim())

  return (
    <div className={styles.agentTimeline}>
      {completedSteps.map((step: AgentStepEntry) => (
        <div key={`step-${step.step}`} className={styles.agentStepGroup}>
          <div className={styles.stepDivider}>{t.agentStepLabel(step.step)}</div>
          {step.thinking && (
            <ThinkingBlock
              text={step.thinking}
              durationMs={step.thinkingDurationMs}
            />
          )}
          {renderInterleavedStep(step, allTools, workspacePath, false, null, null, onImplementPlan)}
        </div>
      ))}

      {showLiveGroup && currentStep && (
        <div className={styles.agentStepGroup}>
          <div className={styles.stepDivider}>{t.agentStepLabel(currentStep)}</div>
          {(stepThinking || thinkingLive) && (
            <ThinkingBlock
              text={stepThinking}
              live={thinkingLive}
              durationMs={activeStepEntry?.thinkingDurationMs}
            />
          )}
          {renderInterleavedStep(
            activeStepEntry ?? { step: currentStep, tools: [] },
            allTools,
            workspacePath,
            isStreaming,
            streamFocus,
            liveProse,
            onImplementPlan
          )}
        </div>
      )}

      {liveThinking && !currentStep && (
        <ThinkingBlock text={liveThinking} live />
      )}

      {statusLine && (
        <div className={styles.agentStatusLine}>{statusLine}</div>
      )}
    </div>
  )
}
