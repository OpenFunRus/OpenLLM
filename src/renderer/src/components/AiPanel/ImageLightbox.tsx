import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../../../shared/i18n'
import styles from './ImageLightbox.module.css'

interface Transform {
  scale: number
  x: number
  y: number
}

interface Props {
  src: string
  alt: string
  open: boolean
  onClose: () => void
}

function fitTransform(
  viewportW: number,
  viewportH: number,
  imgW: number,
  imgH: number
): Transform {
  const scale = Math.min(viewportW / imgW, viewportH / imgH, 1) * 0.92
  return {
    scale,
    x: (viewportW - imgW * scale) / 2,
    y: (viewportH - imgH * scale) / 2,
  }
}

export function ImageLightbox({ src, alt, open, onClose }: Props): JSX.Element | null {
  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const transformRef = useRef<Transform>({ scale: 1, x: 0, y: 0 })
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [ready, setReady] = useState(false)

  transformRef.current = transform

  const applyTransform = useCallback((next: Transform) => {
    transformRef.current = next
    setTransform(next)
  }, [])

  useEffect(() => {
    if (!open) {
      setNatural(null)
      setReady(false)
      applyTransform({ scale: 1, x: 0, y: 0 })
    }
  }, [open, src, applyTransform])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !viewportRef.current) return
    const el = viewportRef.current

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const prev = transformRef.current
      const newScale = Math.min(12, Math.max(0.15, prev.scale * factor))
      const imgX = (mx - prev.x) / prev.scale
      const imgY = (my - prev.y) / prev.scale
      applyTransform({
        scale: newScale,
        x: mx - imgX * newScale,
        y: my - imgY * newScale,
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open, applyTransform])

  const handleImageLoad = useCallback((img: HTMLImageElement) => {
    const vp = viewportRef.current
    if (!vp || !img.naturalWidth) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    setNatural({ w, h })
    applyTransform(fitTransform(vp.clientWidth, vp.clientHeight, w, h))
    setReady(true)
  }, [applyTransform])

  useEffect(() => {
    if (!open || !imgRef.current?.complete) return
    handleImageLoad(imgRef.current)
  }, [open, src, handleImageLoad])

  if (!open) return null

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.toolbar} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div
        ref={viewportRef}
        className={styles.viewport}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={styles.imageLayer}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            width: natural?.w,
            height: natural?.h,
            opacity: ready ? 1 : 0,
          }}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            onLoad={(e) => handleImageLoad(e.currentTarget)}
          />
        </div>
      </div>
      <div className={styles.hint} onClick={(e) => e.stopPropagation()}>
        {t.imageLightboxHint}
      </div>
    </div>,
    document.body
  )
}
