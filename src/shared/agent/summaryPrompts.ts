export const SUMMARY_SYSTEM_PROMPT = `You compress coding-agent conversation history for context window management.
Output a dense factual summary in markdown. Do not invent details not present in the segment.`

export function buildSummaryUserPrompt(serializedSegment: string, targetRatio: number): string {
  const targetPercent = Math.max(10, Math.min(50, Math.round(targetRatio * 100)))
  const reductionPercent = 100 - targetPercent
  return `Compress the conversation segment below to roughly ${targetPercent}% of its original length (approximately ${reductionPercent}% reduction).

MUST preserve:
- User's overall goal and current task state
- Key decisions and rationale
- Files created, modified, or deleted (with paths)
- Errors encountered and fixes attempted
- Open questions and TODOs
- Important shell commands and their outcomes

OMIT:
- Full file contents and large tool outputs
- Repeated reasoning and pleasantries
- Redundant tool-call details (keep path + outcome only)

Reply with ONLY the summary body (markdown). No preamble.

--- CONVERSATION SEGMENT ---
${serializedSegment}`
}
