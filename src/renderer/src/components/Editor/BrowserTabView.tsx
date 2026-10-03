import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserEditorTab } from '@shared/types'
import { t } from '@shared/i18n'
import { useEditorStore } from '../../store/editorStore'
import { useUiStore } from '../../store/uiStore'
import { browserWebviewScrollbarCss } from './browserWebviewScrollCss'
import styles from './BrowserTabView.module.css'

interface Props {
  tab: BrowserEditorTab
}

type WebviewElement = HTMLElement & {
  loadURL: (url: string) => void
  reload: () => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  getURL: () => string
  insertCSS: (css: string) => Promise<string>
  removeInsertedCSS: (key: string) => Promise<void>
  src: string
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'about:blank'
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function BrowserTabView({ tab }: Props): JSX.Element {
  const webviewRef = useRef<WebviewElement | null>(null)
  const scrollCssKeyRef = useRef<string | null>(null)
  const { setBrowserTabUrl } = useEditorStore()
  const theme = useUiStore((s) => s.theme)
  const [address, setAddress] = useState(tab.url === 'about:blank' ? '' : tab.url)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)

  const injectScrollbarStyles = useCallback(async () => {
    const wv = webviewRef.current
    if (!wv?.insertCSS) return

    if (scrollCssKeyRef.current) {
      try {
        await wv.removeInsertedCSS(scrollCssKeyRef.current)
      } catch {
        /* navigation may invalidate the key */
      }
      scrollCssKeyRef.current = null
    }

    try {
      scrollCssKeyRef.current = await wv.insertCSS(browserWebviewScrollbarCss(theme))
    } catch {
      /* guest not ready */
    }
  }, [theme])

  const syncNavState = useCallback(() => {
    const wv = webviewRef.current
    if (!wv) return
    setCanBack(wv.canGoBack())
    setCanForward(wv.canGoForward())
    const current = wv.getURL()
    if (current && current !== 'about:blank') {
      setAddress(current)
      setBrowserTabUrl(tab.id, current)
    }
  }, [setBrowserTabUrl, tab.id])

  const navigate = useCallback((raw: string) => {
    const url = normalizeUrl(raw)
    const wv = webviewRef.current
    if (wv) {
      wv.loadURL(url)
    }
    setAddress(url === 'about:blank' ? '' : url)
    setBrowserTabUrl(tab.id, url)
  }, [setBrowserTabUrl, tab.id])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onDomReady = () => {
      void injectScrollbarStyles()
      syncNavState()
    }
    const onNavigate = () => syncNavState()

    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    wv.addEventListener('dom-ready', onDomReady)

    return () => {
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
      wv.removeEventListener('dom-ready', onDomReady)
    }
  }, [tab.id, syncNavState, injectScrollbarStyles])

  useEffect(() => {
    void injectScrollbarStyles()
  }, [injectScrollbarStyles])

  return (
    <div className={styles.shell}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.navBtn}
          disabled={!canBack}
          onClick={() => webviewRef.current?.goBack()}
          data-tooltip={t.browserBack}
          aria-label={t.browserBack}
        >
          ←
        </button>
        <button
          type="button"
          className={styles.navBtn}
          disabled={!canForward}
          onClick={() => webviewRef.current?.goForward()}
          data-tooltip={t.browserForward}
          aria-label={t.browserForward}
        >
          →
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => webviewRef.current?.reload()}
          data-tooltip={t.browserRefresh}
          aria-label={t.browserRefresh}
        >
          ↻
        </button>
        <form
          className={styles.urlForm}
          onSubmit={(e) => {
            e.preventDefault()
            navigate(address)
          }}
        >
          <input
            className={styles.urlInput}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t.browserUrlPlaceholder}
            spellCheck={false}
          />
        </form>
        <button
          type="button"
          className={styles.goBtn}
          onClick={() => navigate(address)}
        >
          {t.browserNavigate}
        </button>
      </div>
      <div className={styles.webviewWrap}>
        <webview
          key={tab.id}
          ref={(el) => { webviewRef.current = el as WebviewElement | null }}
          className={styles.webview}
          src="about:blank"
          partition={tab.partition}
          allowpopups=""
        />
      </div>
    </div>
  )
}
