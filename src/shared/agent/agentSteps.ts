import type { AgentToolEvent } from './types'

/** One orchestrator loop iteration: reasoning → tool(s) → model again. */
export type AgentStepEntry = {
  step: number
  thinking?: string
  /** Prose segments before tool[0], tool[1], … (interleaved in timeline). */
  proseBlocks?: string[]
  tools: AgentToolEvent[]
}

export function upsertAgentStep(
  steps: AgentStepEntry[] | undefined,
  step: number,
  patch: { thinking?: string; tool?: AgentToolEvent; proseBlock?: string }
): AgentStepEntry[] {
  const list = [...(steps ?? [])]
  const idx = list.findIndex((s) => s.step === step)

  if (idx === -1) {
    list.push({
      step,
      thinking: patch.thinking,
      proseBlocks: patch.proseBlock ? [patch.proseBlock] : undefined,
      tools: patch.tool ? [patch.tool] : [],
    })
  } else {
    const current = list[idx]
    let tools = current.tools
    if (patch.tool) {
      const toolId = patch.tool.toolId
      if (toolId) {
        const toolIdx = tools.findIndex((t) => t.toolId === toolId)
        tools = toolIdx >= 0
          ? tools.map((t, i) => (i === toolIdx ? { ...t, ...patch.tool! } : t))
          : [...tools, patch.tool]
      } else {
        tools = [...tools, patch.tool]
      }
    }
    list[idx] = {
      ...current,
      thinking: patch.thinking ?? current.thinking,
      proseBlocks: patch.proseBlock
        ? [...(current.proseBlocks ?? []), patch.proseBlock]
        : current.proseBlocks,
      tools,
    }
  }

  list.sort((a, b) => a.step - b.step)
  return list
}

/** Rebuild interleaved steps from legacy flat arrays (old saved chats). */
export function buildAgentStepsFromLegacy(
  thinkingBlocks?: string[],
  toolEvents?: AgentToolEvent[]
): AgentStepEntry[] {
  const map = new Map<number, AgentStepEntry>()

  toolEvents?.forEach((tool) => {
    const existing = map.get(tool.step) ?? { step: tool.step, tools: [] }
    map.set(tool.step, { ...existing, tools: [...existing.tools, tool] })
  })

  thinkingBlocks?.forEach((thinking, idx) => {
    const step = idx + 1
    const existing = map.get(step) ?? { step, tools: [] }
    map.set(step, { ...existing, thinking })
  })

  return [...map.values()].sort((a, b) => a.step - b.step)
}

export function flattenToolEvents(steps: AgentStepEntry[] | undefined): AgentToolEvent[] {
  if (!steps?.length) return []
  return steps.flatMap((s) => s.tools)
}
