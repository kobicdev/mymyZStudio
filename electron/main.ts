import { app, BrowserWindow, session, protocol, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// 로컬 이미지 파일을 렌더러에서 로드할 수 있도록 커스텀 프로토콜 등록
// (dev 모드에서 http://localhost는 file:// 로드가 차단됨)
protocol.registerSchemesAsPrivileged([
  { scheme: 'zimg', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

// ─── IPC Handlers ─────────────────────────────────────────────
import { registerInferenceHandlers } from './ipc/inference.ipc'
import { registerGalleryHandlers } from './ipc/gallery.ipc'
import { registerSettingsHandlers } from './ipc/settings.ipc'
import { registerLlmHandlers } from './ipc/llm.ipc'
import { registerModelsHandlers } from './ipc/models.ipc'

// ─── Services (지연 import — native module 오류 격리) ─────────
// DbService, SettingsService, InferenceService는 아래에서 dynamic require

const isDev = process.env.NODE_ENV === 'development'
const VITE_DEV_SERVER_URL = 'http://localhost:5173'

// ─── 서비스 초기화 ─────────────────────────────────────────────
function initializeServices(): void {
  process.stderr.write('[STARTUP] initializeServices start\n')

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SettingsService } = require('./services/settings') as typeof import('./services/settings')
    SettingsService.getInstance().initialize()
    process.stderr.write('[STARTUP] SettingsService OK\n')

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { InferenceService } = require('./services/inference') as typeof import('./services/inference')
      const outputDir = SettingsService.getInstance().getOutputDir()
      InferenceService.getInstance().setOutputDir(outputDir)
      process.stderr.write(`[STARTUP] InferenceService OK, outputDir=${outputDir}\n`)
    } catch (err) {
      process.stderr.write(`[STARTUP] InferenceService FAILED: ${err}\n`)
    }
  } catch (err) {
    process.stderr.write(`[STARTUP] SettingsService FAILED: ${err}\n`)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DbService } = require('./services/db') as typeof import('./services/db')
    DbService.getInstance().initialize()
    process.stderr.write('[STARTUP] DbService OK\n')
  } catch (err) {
    process.stderr.write(`[STARTUP] DbService FAILED: ${err}\n`)
  }

  process.stderr.write('[STARTUP] initializeServices done\n')
}

// ─── IPC 핸들러 등록 ─────────────────────────────────────────
function registerHandlers(): void {
  process.stderr.write('[STARTUP] registerHandlers start\n')

  try {
    registerInferenceHandlers()
    process.stderr.write('[STARTUP] inference handlers OK\n')
  } catch (err) {
    process.stderr.write(`[STARTUP] inference handlers FAILED: ${err}\n`)
  }

  try {
    registerGalleryHandlers()
    process.stderr.write('[STARTUP] gallery handlers OK\n')
  } catch (err) {
    process.stderr.write(`[STARTUP] gallery handlers FAILED: ${err}\n`)
  }

  try {
    registerSettingsHandlers()
    process.stderr.write('[STARTUP] settings handlers OK\n')
  } catch (err) {
    process.stderr.write(`[STARTUP] settings handlers FAILED: ${err}\n`)
  }

  try {
    registerLlmHandlers()
    process.stderr.write('[STARTUP] llm handlers OK\n')
  } catch (err) {
    process.stderr.write(`[STARTUP] llm handlers FAILED: ${err}\n`)
  }

  try {
    registerModelsHandlers()
    process.stderr.write('[STARTUP] models handlers OK\n')
  } catch (err) {
    process.stderr.write(`[STARTUP] models handlers FAILED: ${err}\n`)
  }

  process.stderr.write('[STARTUP] registerHandlers done\n')
}

// ─── BrowserWindow 생성 ────────────────────────────────────────
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ZImageStudio',
    backgroundColor: '#0f0f14',
    frame: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // CSP 헤더
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "style-src-elem 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "img-src 'self' data: file: blob: zimg: https://via.placeholder.com",
          "media-src 'self' file: blob:",
          "connect-src 'self' http://localhost:* ws://localhost:* http://localhost:11434",
          "worker-src 'self' blob:",
        ].join('; ')
      : [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "style-src-elem 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "img-src 'self' data: file: blob: zimg: https://via.placeholder.com",
          "media-src 'self' file: blob:",
          "connect-src 'self' http://localhost:*",
          "worker-src 'self' blob:",
        ].join('; ')

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  if (isDev && VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '../../dist/index.html')
    process.stderr.write(`[STARTUP] Loading index.html from: ${indexPath}\n`)
    
    if (fs.existsSync(indexPath)) {
      win.loadFile(indexPath)
      // 디버깅을 위해 환경변수가 설정된 경우 prod에서도 DevTools 오픈
      if (process.env.DEBUG_ELECTRON === 'true') {
        win.webContents.openDevTools({ mode: 'detach' })
      }
    } else {
      process.stderr.write(`[STARTUP] ERROR: index.html not found at ${indexPath}\n`)
      dialog.showErrorBox('Startup Error', `Could not find index.html at:\n${indexPath}`)
    }
  }

  process.stderr.write('[STARTUP] BrowserWindow created\n')
}

// ─── 앱 라이프사이클 ─────────────────────────────────────────
process.stderr.write('[STARTUP] main.ts loaded\n')

app.whenReady().then(() => {
  process.stderr.write(`[STARTUP] app.whenReady — v${app.getVersion()} (${process.platform})\n`)

  ipcMain.handle('app:choose-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    return result.filePaths[0]
  })

  // zimg: 프로토콜 핸들러 — 로컬 파일을 렌더러에 안전하게 제공
  protocol.handle('zimg', (request) => {
    try {
      const url = new URL(request.url)
      let filePath = ''
      
      if (process.platform === 'win32') {
        // Case 1: host is drive letter (e.g., zimg://D/path -> host: 'D', pathname: '/path')
        if (url.host && url.host.length === 1 && /^[a-zA-Z]$/.test(url.host)) {
          filePath = url.host + ':' + decodeURIComponent(url.pathname)
        } 
        // Case 2: host is empty, pathname starts with drive letter (e.g., zimg:///C:/path)
        else if (!url.host && decodeURIComponent(url.pathname).match(/^\/[a-zA-Z]:/)) {
          filePath = decodeURIComponent(url.pathname).substring(1)
        }
        // Case 3: fallback
        else {
          filePath = decodeURIComponent(url.host + url.pathname)
        }
      } else {
        filePath = decodeURIComponent(url.host + url.pathname)
      }

      const normalizedPath = path.normalize(filePath)
      
      if (!fs.existsSync(normalizedPath)) {
        return new Response('Not Found', { status: 404 })
      }

      // stream으로 반환 (큰 파일 대응)
      const stream = fs.createReadStream(normalizedPath)
      const ext = path.extname(normalizedPath).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : 
                   (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 
                   ext === '.webp' ? 'image/webp' : 'application/octet-stream'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Response(stream as any, {
        headers: { 'Content-Type': mime }
      })
    } catch (err) {
      process.stderr.write(`[zimg] Error: ${err}\n`)
      return new Response('Error', { status: 500 })
    }
  })

  // 순서: 서비스 → IPC → 창
  initializeServices()
  registerHandlers()
  createWindow()

  process.stderr.write('[STARTUP] startup complete\n')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  process.stderr.write('[STARTUP] before-quit cleanup\n')
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ProcessHandler } = require('./services/processHandler') as typeof import('./services/processHandler')
    ProcessHandler.getInstance().killSync()
  } catch (_) {}

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DbService } = require('./services/db') as typeof import('./services/db')
    DbService.getInstance().close()
  } catch (_) {}
})
