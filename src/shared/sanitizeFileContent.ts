/** Remove UTF-8 BOM (U+FEFF) accidentally included in model tool output. */
export function stripUtf8Bom(text: string): string {
  if (!text) return text
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
