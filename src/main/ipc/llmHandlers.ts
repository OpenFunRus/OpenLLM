import type { IpcMain } from 'electron'
import crypto from 'crypto'
import { llmService } from '../services/LlmService'
import { modelRegistryService } from '../services/ModelRegistryService'
import { settingsService } from '../services/SettingsService'
import type { GenerateOptions, ApiModelInput, ChatMessage } from '../../shared/types'

export function registerLlmHandlers(): void {
  const { ipcMain } = require('electron') as { ipcMain: IpcMain }

  llmService.tryRestoreActiveModel()

  ipcMain.handle('llm:load', (_e, modelId: string) =>
    llmService.loadModel(modelId)
  )

  ipcMain.handle('llm:unload', () => llmService.unload())

  ipcMain.handle('llm:clearHistory', () => llmService.clearHistory())

  ipcMain.handle('llm:restoreHistory', (_e, messages: ChatMessage[]) => {
    llmService.restoreHistory(messages)
  })

  ipcMain.handle('llm:status', () => ({
    isLoaded: llmService.isLoaded,
    modelName: llmService.getModelDisplayName()
  }))

  ipcMain.handle('llm:fim', () => '')

  ipcMain.handle('llm:generateStart', async (event, prompt: string, opts: GenerateOptions) => {
    const id = crypto.randomUUID()
    let aborted = false

    setImmediate(async () => {
      try {
        for await (const token of llmService.generate(prompt, opts, (cb) => {
          ipcMain.once(`llm:abort:${id}`, () => { aborted = true; cb() })
        })) {
          if (aborted) break
          if (!event.sender.isDestroyed()) {
            event.sender.send(`llm:token:${id}`, token)
          }
        }
      } catch (err: unknown) {
        if (!event.sender.isDestroyed()) {
          event.sender.send(`llm:error:${id}`, String(err))
        }
      } finally {
        if (!event.sender.isDestroyed()) {
          event.sender.send(`llm:done:${id}`)
        }
      }
    })

    return id
  })

  ipcMain.handle('model:list', () => modelRegistryService.list())

  ipcMain.handle('model:add', (_e, input: ApiModelInput) =>
    modelRegistryService.add(input)
  )

  ipcMain.handle('model:update', async (_e, id: string, input: ApiModelInput) => {
    const updated = modelRegistryService.update(id, input)
    if (settingsService.get('activeModelId') === id && llmService.isLoaded) {
      await llmService.loadModel(id)
    }
    return updated
  })

  ipcMain.handle('model:remove', async (_e, id: string) => {
    const activeId = settingsService.get('activeModelId')
    modelRegistryService.remove(id)
    if (activeId === id) await llmService.unload()
  })
}
