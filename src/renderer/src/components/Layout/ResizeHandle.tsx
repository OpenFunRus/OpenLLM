import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ResizeHandle.module.css'

type Orientation = 'vertical' | 'horizontal'

interface ResizeHandleProps {
  orientation: Orientation
  onResize: (delta: number) => void
}

export function ResizeHandle({ orientation, onResize }: ResizeHandleProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const draggingRef = useRef(false)
  const originRef = useRef(0)
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  const stopDrag = useCallback(() => {
    draggingRef.current = false
    setDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const isVertical = orientation === 'vertical'
  const cursor = isVertical ? 'col-resize' : 'row-resize'

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    originRef.current = isVertical ? e.clientX : e.clientY
    draggingRef.current = true
    setDragging(true)
    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'
  }, [cursor, isVertical])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const current = isVertical ? e.clientX : e.clientY
    const delta = current - originRef.current
    if (delta !== 0) {
      onResizeRef.current(delta)
      originRef.current = current
    }
  }, [isVertical])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    stopDrag()
  }, [stopDrag])

  const handleLostPointerCapture = useCallback(() => {
    stopDrag()
  }, [stopDrag])

  return (
    <>
      <div
        className={[
          styles.splitter,
          isVertical ? styles.vertical : styles.horizontal,
          dragging ? styles.dragging : '',
          hovered ? styles.hovered : '',
        ].filter(Boolean).join(' ')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={handleLostPointerCapture}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => { if (!dragging) setHovered(false) }}
        role="separator"
        aria-orientation={isVertical ? 'vertical' : 'horizontal'}
        aria-valuenow={0}
      >
        <div className={styles.line} />
      </div>

      {dragging && createPortal(
        <div className={styles.dragOverlay} style={{ cursor }} aria-hidden="true" />,
        document.body,
      )}
    </>
  )
}
