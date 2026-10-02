import { t } from '../i18n'

/** Collapsed reasoning label suffix, e.g. «(10 сек.)» or «(1 мин. 10 сек.)». */
export function formatReasoningDuration(ms: number): string {
  const totalSec = Math.max(1, Math.round(ms / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60

  if (min === 0) {
    return t.reasoningWithDuration(`(${totalSec} сек.)`)
  }
  if (sec === 0) {
    return t.reasoningWithDuration(`(${min} мин.)`)
  }
  return t.reasoningWithDuration(`(${min} мин. ${sec} сек.)`)
}
