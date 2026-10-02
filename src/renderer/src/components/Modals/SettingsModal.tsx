import { useState, useEffect } from 'react'
import { useUiStore } from '../../store/uiStore'
import type { AppSettings } from '../../../../shared/types'
import { AGENT_SETTINGS_DEFAULTS } from '../../../../shared/agent/agentSettings'
import { t } from '../../../../shared/i18n'
import styles from './SettingsModal.module.css'

type Section = 'agent' | 'mcp'

type McpConfigFile = {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>
}

const DEFAULT_MCP_JSON = '{\n  "mcpServers": {\n    "example": {\n      "command": "npx",\n      "args": ["-y", "my-mcp-server"]\n    }\n  }\n}\n'

export function SettingsModal(): JSX.Element | null {
  const { settingsOpen, setSettingsOpen } = useUiStore()
  const [section, setSection] = useState<Section>('agent')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [mcpScope, setMcpScope] = useState<'user' | 'workspace'>('user')
  const [mcpJson, setMcpJson] = useState(DEFAULT_MCP_JSON)
  const [mcpPath, setMcpPath] = useState<string | null>(null)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settingsOpen) return
    void window.api.getSettings().then(setSettings)
    void loadMcpConfig('user')
  }, [settingsOpen])

  useEffect(() => {
    if (settingsOpen) void loadMcpConfig(mcpScope)
  }, [mcpScope, settingsOpen])

  const loadMcpConfig = async (scope: 'user' | 'workspace') => {
    setMcpError(null)
    const result = await window.api.getMcpConfig(scope)
    setMcpPath(result.path)
    setMcpJson(JSON.stringify(result.config ?? { mcpServers: {} }, null, 2))
    if (result.parseError) setMcpError(t.mcpParseError)
  }

  if (!settingsOpen || !settings) return null

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
  }

  const save = async () => {
    if (!settings) return
    const keys: (keyof AppSettings)[] = [
      'agentAutoApply',
      'agentMaxSteps',
      'agentMaxWallTimeMin',
      'agentAutoContinue',
      'agentContextStopPercent',
      'tavilyApiKey',
    ]
    for (const k of keys) await window.api.setSetting(k, settings[k] as AppSettings[typeof k])

    if (section === 'mcp') {
      try {
        const parsed = JSON.parse(mcpJson) as McpConfigFile
        await window.api.setMcpConfig({ scope: mcpScope, config: parsed })
        setMcpError(null)
      } catch {
        setMcpError(t.mcpInvalidJson)
        return
      }
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const navItems: { id: Section; label: string }[] = [
    { id: 'agent', label: t.sectionAgent },
    { id: 'mcp', label: t.sectionMcp },
  ]

  return (
    <div className={styles.overlay} onClick={() => setSettingsOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t.settingsTitle}</span>
          <button className="icon-btn" onClick={() => setSettingsOpen(false)}>✕</button>
        </div>

        <div className={styles.body}>
          <nav className={styles.nav}>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`${styles.navItem} ${section === item.id ? styles.navActive : ''}`}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            {section === 'agent' && (
              <>
                <div className={styles.group}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={settings.agentAutoApply}
                      onChange={(e) => update('agentAutoApply', e.target.checked)}
                    />
                    {t.agentAutoApply}
                  </label>
                  <span className={styles.hint}>{t.agentAutoApplyHint}</span>
                </div>
                <div className={styles.group}>
                  <label className={styles.label}>{t.agentMaxSteps}</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={5}
                    max={200}
                    value={settings.agentMaxSteps}
                    onChange={(e) => update('agentMaxSteps', Number(e.target.value))}
                  />
                  <span className={styles.hint}>{t.agentMaxStepsHint(AGENT_SETTINGS_DEFAULTS.agentMaxSteps)}</span>
                </div>
                <div className={styles.group}>
                  <label className={styles.label}>{t.agentMaxWallTimeMin}</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={5}
                    max={240}
                    value={settings.agentMaxWallTimeMin}
                    onChange={(e) => update('agentMaxWallTimeMin', Number(e.target.value))}
                  />
                  <span className={styles.hint}>{t.agentMaxWallHint}</span>
                </div>
                <div className={styles.group}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={settings.agentAutoContinue}
                      onChange={(e) => update('agentAutoContinue', e.target.checked)}
                    />
                    {t.agentAutoContinue}
                  </label>
                  <span className={styles.hint}>{t.agentAutoContinueHint}</span>
                </div>
                <div className={styles.group}>
                  <label className={styles.label}>{t.agentContextStopPercent}</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={50}
                    max={99}
                    value={settings.agentContextStopPercent}
                    onChange={(e) => update('agentContextStopPercent', Number(e.target.value))}
                  />
                  <span className={styles.hint}>{t.agentContextStopHint}</span>
                </div>
                <div className={styles.group}>
                  <label className={styles.label}>{t.tavilyApiKey}</label>
                  <input
                    className={styles.input}
                    type="password"
                    value={settings.tavilyApiKey}
                    placeholder={t.tavilyApiKeyPlaceholder}
                    onChange={(e) => update('tavilyApiKey', e.target.value)}
                    autoComplete="off"
                  />
                  <span className={styles.hint}>{t.tavilyApiKeyHint}</span>
                </div>
              </>
            )}

            {section === 'mcp' && (
              <>
                <div className={styles.group}>
                  <label className={styles.label}>{t.mcpConfigScope}</label>
                  <select
                    className={styles.select}
                    value={mcpScope}
                    onChange={(e) => setMcpScope(e.target.value as 'user' | 'workspace')}
                  >
                    <option value="user">{t.mcpScopeUser}</option>
                    <option value="workspace">{t.mcpScopeWorkspace}</option>
                  </select>
                  {mcpPath && <span className={styles.hint}>{t.mcpConfigPath(mcpPath)}</span>}
                </div>
                <div className={styles.group}>
                  <label className={styles.label}>{t.mcpConfigJson}</label>
                  <textarea
                    className={styles.textarea}
                    value={mcpJson}
                    onChange={(e) => {
                      setMcpJson(e.target.value)
                      setMcpError(null)
                    }}
                    spellCheck={false}
                  />
                  {mcpError && <span className={styles.hint}>{mcpError}</span>}
                  <span className={styles.hint}>{t.mcpConfigHint}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={() => setSettingsOpen(false)}>{t.cancel}</button>
          <button className={styles.saveBtn} onClick={() => void save()}>
            {saved ? t.saved : t.save}
          </button>
        </div>
      </div>
    </div>
  )
}
