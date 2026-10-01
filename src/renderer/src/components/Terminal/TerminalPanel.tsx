import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { useUiStore } from '../../store/uiStore'
import { t } from '../../../../shared/i18n'
import 'xterm/css/xterm.css'
import styles from './TerminalPanel.module.css'

interface Props {
  cwd: string
  sessionId?: string | null
}

const TERM_ID = 'main'

export function TerminalPanel({ cwd, sessionId }: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const {
    toggleTerminal,
    terminalVisible,
    setTerminalVisible,
    sidebarWidth,
    aiPanelWidth,
    aiPanelVisible,
  } = useUiStore()
  const lastCommandRef = useRef<string | null>(null)

  const fitTerminal = () => {
    const term = termRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !fitAddon) return
    fitAddon.fit()
    window.api.termResize(TERM_ID, term.cols, term.rows)
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

    window.api.termCreate(TERM_ID, cwd).then(() => {
      fitTerminal()
    })

    const unsubData = window.api.onTermData(TERM_ID, (data) => term.write(data))
    term.onData((data) => window.api.termWrite(TERM_ID, data))

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal()
    })
    if (panelRef.current) resizeObserver.observe(panelRef.current)
    resizeObserver.observe(containerRef.current)

    return () => {
      unsubData()
      resizeObserver.disconnect()
      window.api.termKill(TERM_ID)
      term.dispose()
    }
  }, [cwd])

  useEffect(() => {
    if (!terminalVisible) return
    const id = requestAnimationFrame(() => fitTerminal())
    return () => cancelAnimationFrame(id)
  }, [terminalVisible, sidebarWidth, aiPanelWidth, aiPanelVisible])

  useEffect(() => {
    const onWindowResize = () => fitTerminal()
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const unsub = window.api.onAgentShellOutput(sessionId, (payload) => {
      const term = termRef.current
      if (!term) return
      if (!terminalVisible) setTerminalVisible(true)
      if (lastCommandRef.current !== payload.command) {
        lastCommandRef.current = payload.command
        term.writeln(`\r\n\x1b[36m${t.agentShellPrefix(payload.command)}\x1b[0m`)
      }
      term.write(payload.data)
    })
    return unsub
  }, [sessionId, terminalVisible, setTerminalVisible])

  return (
    <div ref={panelRef} className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{t.terminalHeader}</span>
        <button className="icon-btn" onClick={toggleTerminal} title={t.closeTerminal}>✕</button>
      </div>
      <div ref={containerRef} className={styles.xterm} />
    </div>
  )
}
