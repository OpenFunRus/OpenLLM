import { useState, useEffect, type ReactNode } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useAiStore } from '../../store/aiStore'
import type { ApiModelConfig, ApiModelInput } from '../../../../shared/types'
import { MODEL_SAMPLING_DEFAULTS } from '../../../../shared/chatCompletionPayload'
import {
  MODEL_CONTEXT_DEFAULT_K,
  MODEL_CONTEXT_MAX_K,
  MODEL_CONTEXT_MIN_K,
  MODEL_CONTEXT_STEP_K,
  MODEL_OUTPUT_DEFAULT,
  MODEL_OUTPUT_MAX,
  MODEL_OUTPUT_MIN,
  MODEL_OUTPUT_STEP,
  formatModelContextLabel,
  formatModelOutputLabel,
  normalizeModelContextK,
  normalizeModelOutputTokens,
  resolveModelAuthType,
} from '../../../../shared/modelConfig'
import { t } from '../../../../shared/i18n'
import styles from './ModelManagerModal.module.css'

const emptyForm = (): ApiModelInput => ({
  displayName: '',
  modelName: '',
  url: '',
  token: '',
  authType: 'none',
  contextSize: MODEL_CONTEXT_DEFAULT_K,
  maxOutputTokens: MODEL_OUTPUT_DEFAULT,
  customizeApiParams: MODEL_SAMPLING_DEFAULTS.customizeApiParams,
  temperature: MODEL_SAMPLING_DEFAULTS.temperature,
  topP: MODEL_SAMPLING_DEFAULTS.topP,
  topK: MODEL_SAMPLING_DEFAULTS.topK,
  minP: MODEL_SAMPLING_DEFAULTS.minP,
  repetitionPenalty: MODEL_SAMPLING_DEFAULTS.repetitionPenalty,
})

function normalizeDisplayName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function SettingRow({
  name,
  description,
  children,
}: {
  name: string
  description: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingName}>{name}</div>
      {children}
      <div className={styles.settingDesc}>{description}</div>
    </div>
  )
}

export function ModelManagerModal(): JSX.Element | null {
  const { modelManagerOpen, setModelManagerOpen } = useUiStore()
  const { setModelStatus } = useAiStore()

  const [models, setModels] = useState<ApiModelConfig[]>([])
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ApiModelInput>(emptyForm())

  const refresh = async () => {
    setModels(await window.api.listModels())
  }

  useEffect(() => {
    if (modelManagerOpen) {
      refresh()
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      setError(null)
    }
  }, [modelManagerOpen])

  if (!modelManagerOpen) return null

  const openAddForm = () => {
    setEditingId(null)
    setForm(emptyForm())
    setShowForm(true)
    setError(null)
  }

  const openEditForm = (model: ApiModelConfig) => {
    setEditingId(model.id)
    setForm({
      displayName: model.displayName,
      modelName: model.modelName,
      url: model.url,
      token: '',
      authType: resolveModelAuthType(model.authType, Boolean(model.token)),
      contextSize: normalizeModelContextK(model.contextSize),
      maxOutputTokens: normalizeModelOutputTokens(model.maxOutputTokens),
      customizeApiParams: model.customizeApiParams ?? false,
      temperature: model.temperature ?? MODEL_SAMPLING_DEFAULTS.temperature,
      topP: model.topP ?? MODEL_SAMPLING_DEFAULTS.topP,
      topK: model.topK ?? MODEL_SAMPLING_DEFAULTS.topK,
      minP: model.minP ?? MODEL_SAMPLING_DEFAULTS.minP,
      repetitionPenalty: model.repetitionPenalty ?? MODEL_SAMPLING_DEFAULTS.repetitionPenalty,
    })
    setShowForm(true)
    setError(null)
  }

  const validateForm = (): string | null => {
    if (!form.displayName.trim()) return t.modelDisplayNameRequired
    if (!form.modelName.trim()) return t.modelApiNameRequired
    if (!form.url.trim()) return t.modelUrlRequired

    const normalized = normalizeDisplayName(form.displayName)
    const duplicate = models.some(
      (m) => m.id !== editingId && normalizeDisplayName(m.displayName) === normalized
    )
    if (duplicate) return t.modelDisplayNameDuplicate

    if (form.authType !== 'none' && !form.token.trim() && !editingId) {
      return t.modelTokenRequired
    }

    return null
  }

  const handleSave = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    try {
      setError(null)
      const payload: ApiModelInput = {
        ...form,
        contextSize: normalizeModelContextK(form.contextSize),
        maxOutputTokens: normalizeModelOutputTokens(form.maxOutputTokens),
        token: form.authType === 'none' ? '' : form.token,
      }
      if (editingId) {
        await window.api.updateModel(editingId, payload)
      } else {
        await window.api.addModel(payload)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  const handleRemove = async (id: string) => {
    try {
      setError(null)
      await window.api.removeModel(id)
      const status = await window.api.getLlmStatus()
      setModelStatus(status.isLoaded, status.modelName)
      await refresh()
      if (editingId === id) {
        setShowForm(false)
        setEditingId(null)
        setForm(emptyForm())
      }
    } catch (e) {
      setError(String(e))
    }
  }

  const updateField = <K extends keyof ApiModelInput>(key: K, value: ApiModelInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const needsToken = form.authType !== 'none'

  return (
    <div className={styles.overlay} onClick={() => setModelManagerOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t.modelManager}</span>
          <button className="icon-btn" onClick={() => setModelManagerOpen(false)}>✕</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>{t.myModels(models.length)}</span>
              {!showForm && (
                <button className={styles.addBtn} onClick={openAddForm}>{t.addModel}</button>
              )}
            </div>

            {models.length === 0 && !showForm && (
              <div className={styles.emptyHint}>{t.noModelsYet}</div>
            )}

            {models.map((m) => (
              <div key={m.id} className={styles.modelRow}>
                <div className={styles.modelInfo}>
                  <div className={styles.modelName}>{m.displayName}</div>
                  <div className={styles.modelMeta}>
                    {m.modelName} · {formatModelContextLabel(m.contextSize)}
                    {m.customizeApiParams
                      ? ` · out ${formatModelOutputLabel(m.maxOutputTokens)} · ${t.modelCustomSampling}`
                      : ''}
                  </div>
                  <div className={styles.modelUrl}>{m.url}</div>
                </div>
                <div className={styles.modelActions}>
                  <button className={styles.editBtn} onClick={() => openEditForm(m)}>{t.edit}</button>
                  <button className={styles.deleteBtn} onClick={() => handleRemove(m.id)}>{t.delete}</button>
                </div>
              </div>
            ))}
          </div>

          {showForm && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>
                  {editingId ? t.editModel : t.addModel}
                </span>
              </div>
              <div className={styles.form}>
                <SettingRow name={t.modelDisplayName} description={t.modelDisplayNameDesc}>
                  <input
                    className={styles.input}
                    placeholder={t.modelDisplayNamePlaceholder}
                    value={form.displayName}
                    onChange={(e) => updateField('displayName', e.target.value)}
                  />
                </SettingRow>

                <SettingRow name={t.modelApiName} description={t.modelApiNameDesc}>
                  <input
                    className={styles.input}
                    placeholder={t.modelApiNamePlaceholder}
                    value={form.modelName}
                    onChange={(e) => updateField('modelName', e.target.value)}
                  />
                </SettingRow>

                <SettingRow name={t.modelUrl} description={t.modelUrlDesc}>
                  <input
                    className={styles.input}
                    placeholder={t.modelUrlPlaceholder}
                    value={form.url}
                    onChange={(e) => updateField('url', e.target.value)}
                  />
                </SettingRow>

                <SettingRow name={t.modelAuthType} description={t.modelAuthTypeDesc}>
                  <select
                    className={styles.input}
                    value={form.authType === 'auto' ? 'none' : form.authType}
                    onChange={(e) => {
                      const authType = e.target.value as ApiModelInput['authType']
                      updateField('authType', authType)
                      if (authType === 'none') updateField('token', '')
                    }}
                  >
                    <option value="none">{t.authNone}</option>
                    <option value="x-api-key">{t.authXApiKey}</option>
                    <option value="bearer">{t.authBearer}</option>
                    <option value="raw">{t.authRaw}</option>
                  </select>
                </SettingRow>

                {needsToken && (
                  <SettingRow name={t.modelToken} description={t.modelTokenDesc}>
                    <input
                      className={styles.input}
                      type="password"
                      placeholder={editingId ? t.modelTokenEditPlaceholder : t.modelTokenPlaceholder}
                      value={form.token}
                      onChange={(e) => updateField('token', e.target.value)}
                      autoComplete="off"
                    />
                  </SettingRow>
                )}

                <SettingRow name={t.modelContextSize} description={t.modelContextSizeDesc}>
                  <div className={styles.sliderRow}>
                    <input
                      className={styles.slider}
                      type="range"
                      min={MODEL_CONTEXT_MIN_K}
                      max={MODEL_CONTEXT_MAX_K}
                      step={MODEL_CONTEXT_STEP_K}
                      value={form.contextSize}
                      onChange={(e) => updateField('contextSize', Number(e.target.value))}
                    />
                    <span className={styles.sliderValue}>{formatModelContextLabel(form.contextSize)}</span>
                  </div>
                </SettingRow>

                <div className={styles.checkSetting}>
                  <label className={styles.checkSettingLabel}>
                    <input
                      type="checkbox"
                      checked={form.customizeApiParams}
                      onChange={(e) => updateField('customizeApiParams', e.target.checked)}
                    />
                    <span className={styles.settingName}>{t.modelCustomizeApiParams}</span>
                  </label>
                  <div className={styles.settingDesc}>{t.modelCustomizeApiParamsDesc}</div>
                </div>

                {form.customizeApiParams && (
                  <div className={styles.samplingGroup}>
                    <SettingRow name={t.modelMaxOutput} description={t.modelMaxOutputDesc}>
                      <div className={styles.sliderRow}>
                        <input
                          className={styles.slider}
                          type="range"
                          min={MODEL_OUTPUT_MIN}
                          max={MODEL_OUTPUT_MAX}
                          step={MODEL_OUTPUT_STEP}
                          value={form.maxOutputTokens}
                          onChange={(e) => updateField('maxOutputTokens', Number(e.target.value))}
                        />
                        <span className={styles.sliderValue}>{t.tokens(form.maxOutputTokens)}</span>
                      </div>
                    </SettingRow>

                    <SettingRow name={t.modelTemperature} description={t.modelTemperatureDesc}>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        max={2}
                        step={0.05}
                        value={form.temperature}
                        onChange={(e) => updateField('temperature', Number(e.target.value))}
                      />
                    </SettingRow>

                    <SettingRow name={t.modelTopP} description={t.modelTopPDesc}>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.topP}
                        onChange={(e) => updateField('topP', Number(e.target.value))}
                      />
                    </SettingRow>

                    <SettingRow name={t.modelTopK} description={t.modelTopKDesc}>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        max={500}
                        step={1}
                        value={form.topK}
                        onChange={(e) => updateField('topK', Number(e.target.value))}
                      />
                    </SettingRow>

                    <SettingRow name={t.modelMinP} description={t.modelMinPDesc}>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={form.minP}
                        onChange={(e) => updateField('minP', Number(e.target.value))}
                      />
                    </SettingRow>

                    <SettingRow name={t.modelRepetitionPenalty} description={t.modelRepetitionPenaltyDesc}>
                      <input
                        className={styles.input}
                        type="number"
                        min={0.5}
                        max={2}
                        step={0.05}
                        value={form.repetitionPenalty}
                        onChange={(e) => updateField('repetitionPenalty', Number(e.target.value))}
                      />
                    </SettingRow>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {showForm && (
          <div className={styles.footer}>
            <span />
            <div className={styles.footerActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()) }}
              >
                {t.cancel}
              </button>
              <button className={styles.saveFormBtn} onClick={handleSave}>
                {editingId ? t.save : t.addModel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
