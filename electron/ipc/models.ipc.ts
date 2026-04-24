import { ipcMain } from 'electron'
import { ModelsService } from '../services/models'

export function registerModelsHandlers(): void {
  ipcMain.handle('model:list-loras', async () => {
    return await ModelsService.getInstance().listLoras()
  })

  ipcMain.handle('model:list', async () => {
    return await ModelsService.getInstance().listModels()
  })
}
