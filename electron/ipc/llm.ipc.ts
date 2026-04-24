import { ipcMain } from 'electron'
import { LlmService } from '../services/llm'
import { IPC_CHANNELS } from '../../src/shared/types'

export function registerLlmHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.LLM_CHECK, async () => {
    return await LlmService.getInstance().checkAvailability()
  })

  ipcMain.handle(IPC_CHANNELS.LLM_ENHANCE, async (_, { prompt }: { prompt: string }) => {
    return await LlmService.getInstance().translate(prompt)
  })
}
