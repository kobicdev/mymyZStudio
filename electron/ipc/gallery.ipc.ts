import { ipcMain } from 'electron'
import fs from 'fs'
import log from 'electron-log'
import { IPC_CHANNELS, type GalleryQuery } from '../../src/shared/types'
import { DbService } from '../services/db'

/**
 * Gallery IPC 핸들러
 *
 * 채널:
 * - gallery:list
 * - gallery:get
 * - gallery:search
 * - gallery:delete
 * - gallery:toggle-favorite
 * - gallery:lineage
 */
export function registerGalleryHandlers(): void {
  const db = DbService.getInstance()

  ipcMain.handle(IPC_CHANNELS.GALLERY_LIST, (_event, query: GalleryQuery) => {
    log.debug(`[IPC] gallery:list query=${JSON.stringify(query)}`)
    return db.listGenerations(query)
  })

  ipcMain.handle(IPC_CHANNELS.GALLERY_GET, (_event, id: number) => {
    log.debug(`[IPC] gallery:get id=${id}`)
    return db.getGeneration(id) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.GALLERY_SEARCH, (_event, query: string) => {
    log.debug(`[IPC] gallery:search query="${query}"`)
    if (!query || query.trim().length === 0) return []
    try {
      return db.searchGenerations(query.trim())
    } catch (err) {
      log.warn(`[IPC] gallery:search FTS error: ${err}`)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.GALLERY_DELETE, async (_event, id: number) => {
    log.info(`[IPC] gallery:delete id=${id}`)
    const record = db.getGeneration(id)
    if (record) {
      deletePhysicalFiles(record)
    }
    db.deleteGeneration(id)
    return { success: true }
  })
  
  ipcMain.handle(IPC_CHANNELS.GALLERY_DELETE_BULK, async (_event, ids: number[]) => {
    log.info(`[IPC] gallery:delete-bulk ids=${ids.length}`)
    for (const id of ids) {
      const record = db.getGeneration(id)
      if (record) {
        deletePhysicalFiles(record)
      }
    }
    db.deleteGenerations(ids)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.GALLERY_TOGGLE_FAVORITE, (_event, id: number) => {
    log.debug(`[IPC] gallery:toggle-favorite id=${id}`)
    const isFavorite = db.toggleFavorite(id)
    return { id, favorite: isFavorite }
  })

  ipcMain.handle(IPC_CHANNELS.GALLERY_LINEAGE, (_event, id: number) => {
    log.debug(`[IPC] gallery:lineage id=${id}`)
    return db.getLineageTree(id)
  })
}

/**
 * 이미지 및 썸네일 파일 물리적 삭제 헬퍼
 */
function deletePhysicalFiles(record: any) {
  if (record.imagePath && fs.existsSync(record.imagePath)) {
    try {
      fs.unlinkSync(record.imagePath)
      log.info(`[IPC] Deleted image file: ${record.imagePath}`)
    } catch (err) {
      log.warn(`[IPC] Failed to delete image file: ${err}`)
    }
  }
  if (record.thumbnailPath && fs.existsSync(record.thumbnailPath)) {
    try {
      fs.unlinkSync(record.thumbnailPath)
    } catch (_) {}
  }
}
