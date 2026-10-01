import { Component, type ReactNode, type ErrorInfo } from 'react'
import { t } from '../../../shared/i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0d0d0d', color: '#e6e6e6', gap: 16, padding: 32, textAlign: 'center'
      }}>
        <div style={{ fontSize: 32 }}>⚠</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{t.somethingWrong}</div>
        <pre style={{
          background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6,
          padding: '12px 16px', fontSize: 12, color: '#f25c5c',
          maxWidth: 640, overflowX: 'auto', textAlign: 'left', whiteSpace: 'pre-wrap'
        }}>
          {error.message}
        </pre>
        <button
          style={{
            padding: '8px 20px', background: '#007ACC', border: 'none', borderRadius: 5,
            color: '#fff', fontSize: 14, cursor: 'pointer'
          }}
          onClick={() => this.setState({ error: null })}
        >
          {t.tryRecover}
        </button>
      </div>
    )
  }
}
