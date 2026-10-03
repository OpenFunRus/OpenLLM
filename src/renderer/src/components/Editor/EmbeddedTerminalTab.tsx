import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import type { ConsoleEditorTab, PowerShellEditorTab } from '@shared/types'
import 'xterm/css/xterm.css'
import styles from './EmbeddedTerminalTab.module.css'

interface Props {
  tab: ConsoleEditorTab | PowerShellEditorTab
  cwd: string
  active?: boolean
}

function shellForTab(tab: ConsoleEditorTab | PowerShellEditorTab): string | undefined {
  const isWin = navigator.userAgent.includes('Windows')
  if (tab.kind === 'powershell') {
    return isWin ? 'powershell.exe' : 'pwsh'
  }
  return isWin ? 'cmd.exe' : undefined
}

export function EmbeddedTerminalTab({ tab, cwd, active = true }: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const fitTerminal = () => {
    const term = termRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !fitAddon) return
    fitAddon.fit()
    window.api.termResize(tab.termId, term.cols, term.rows)
  }

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d0d0d',
        foreground: '#e6e6e6',
        cursor: '#007ACC',
        selectionBackground: 'rgba(0, 122, 204, 0.3)',
        black: '#1a1a1a', brightBlack: '#555555',
        red: '#f25c5c', brightRed: '#ff7070',
        green: '#3dca7d', brightGreen: '#50e89a',
        yellow: '#e8b84b', brightYellow: '#ffd060',
        blue: '#4d9cf6', brightBlue: '#6db5ff',
        magenta: '#007ACC', brightMagenta: '#1a8ad4',
        cyan: '#3fcfd5', brightCyan: '#55e8ee',
        white: '#e6e6e6', brightWhite: '#ffffff',
      },
      fontFamily: 'Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowTransparency: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    window.api.termCreate(tab.termId, cwd, shellForTab(tab)).then(() => {
      fitTerminal()
    })

    const unsubData = window.api.onTermData(tab.termId, (data) => term.write(data))
    term.onData((data) => window.api.termWrite(tab.termId, data))

    const resizeObserver = new ResizeObserver(() => fitTerminal())
    if (panelRef.current) resizeObserver.observe(panelRef.current)
    resizeObserver.observe(containerRef.current)

    const onWindowResize = () => fitTerminal()
    window.addEventListener('resize', onWindowResize)

    return () => {
      unsubData()
      resizeObserver.disconnect()
      window.removeEventListener('resize', onWindowResize)
      window.api.termKill(tab.termId)
      term.dispose()
    }
  }, [tab.termId, tab.kind, cwd])

  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => fitTerminal())
    return () => cancelAnimationFrame(id)
  }, [active, tab.id])

  return (
    <div ref={panelRef} className={styles.panel}>
      <div ref={containerRef} className={styles.xterm} />
    </div>
  )
}
