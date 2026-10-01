import crypto from 'crypto'
import type { ApiModelConfig, ApiModelInput } from '../../shared/types'
import { normalizeModelSamplingFields } from '../../shared/chatCompletionPayload'
import { normalizeModelContextK, resolveModelAuthType } from '../../shared/modelConfig'
import { settingsService } from './SettingsService'
import { normalizeApiToken } from './apiAuth'

function normalizeDisplayName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

class ModelRegistryService {
  list(): ApiModelConfig[] {
    return (settingsService.get('apiModels') ?? []).map((m) => this.normalizeModel(m))
  }

  private normalizeModel(model: ApiModelConfig): ApiModelConfig {
    return {
      ...model,
      contextSize: normalizeModelContextK(model.contextSize),
      ...normalizeModelSamplingFields(model),
    }
  }

  hasDisplayName(name: string, exceptId?: string): boolean {
    const normalized = normalizeDisplayName(name)
    return this.list().some(
      (m) => m.id !== exceptId && normalizeDisplayName(m.displayName) === normalized
    )
  }

  add(input: ApiModelInput): ApiModelConfig {
    const displayName = input.displayName.trim()
    if (this.hasDisplayName(displayName)) {
      throw new Error('Модель с таким названием уже добавлена')
    }

    const authType = resolveModelAuthType(input.authType, Boolean(input.token.trim()))
    const model: ApiModelConfig = {
      id: crypto.randomUUID(),
      displayName,
      modelName: input.modelName.trim(),
      url: input.url.trim(),
      token: authType === 'none' ? '' : normalizeApiToken(input.token),
      authType,
      contextSize: normalizeModelContextK(input.contextSize),
      ...normalizeModelSamplingFields(input),
    }
    const models = [...this.list(), model]
    settingsService.set('apiModels', models)
    return model
  }

  update(id: string, input: ApiModelInput): ApiModelConfig {
    const models = this.list()
    const idx = models.findIndex((m) => m.id === id)
    if (idx < 0) throw new Error('Модель не найдена')

    const displayName = input.displayName.trim()
    if (this.hasDisplayName(displayName, id)) {
      throw new Error('Модель с таким названием уже добавлена')
    }

    const authType = resolveModelAuthType(input.authType, Boolean(input.token.trim() || models[idx].token))
    const updated: ApiModelConfig = {
      ...models[idx],
      displayName,
      modelName: input.modelName.trim(),
      url: input.url.trim(),
      token: authType === 'none'
        ? ''
        : input.token.trim()
          ? normalizeApiToken(input.token)
          : models[idx].token,
      authType,
      contextSize: normalizeModelContextK(input.contextSize),
      ...normalizeModelSamplingFields(input),
    }
    models[idx] = updated
    settingsService.set('apiModels', models)
    return updated
  }

  remove(id: string): void {
    const models = this.list().filter((m) => m.id !== id)
    settingsService.set('apiModels', models)
    if (settingsService.get('activeModelId') === id) {
      settingsService.set('activeModelId', null)
    }
  }

  getById(id: string): ApiModelConfig | null {
    return this.list().find((m) => m.id === id) ?? null
  }
}

export const modelRegistryService = new ModelRegistryService()
