/** Internal drag type: explorer file → chat composer. */
export const OPENLLM_FILE_DRAG_MIME = 'application/x-openllm-file'

/** Internal drag type: move nodes within the project explorer. */
export const OPENLLM_EXPLORER_DRAG_MIME = 'application/x-openllm-explorer-node'

export const MEDIA_ATTACHMENT_EXTENSIONS = new Set([
  'xbm', 'tif', 'jfif', 'pjp', 'apng', 'jpe', 'jpeg', 'heif', 'ico', 'tiff',
  'webp', 'svgz', 'jpg', 'heic', 'gif', 'svg', 'png', 'bmp', 'pjpeg', 'avif', 'pdf',
])

export function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjp: 'image/jpeg', pjpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon',
    svg: 'image/svg+xml', svgz: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
    heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', apng: 'image/apng', xbm: 'image/x-xbitmap',
    pdf: 'application/pdf',
  }
  return map[ext] ?? 'application/octet-stream'
}

export function fileExtensionFromPath(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? filePath
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isMediaAttachmentPath(filePath: string): boolean {
  return MEDIA_ATTACHMENT_EXTENSIONS.has(fileExtensionFromPath(filePath))
}
