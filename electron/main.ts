import { app, BrowserWindow, session, protocol } from 'electron'
import path from 'path'
import fs from 'fs'

// 로컬 이미지 파일을 렌더러에서 로드할 수 있도록 커스텀 프로토콜 등록
// (dev 모드에서 http://localhost는 file:// 로드가 차단됨)
protocol.registerSchemesAsPrivileged([
  { scheme: 'zimg', privileges: { secure: true, standard: false, supportFetchAPI: true, corsEnabled: true } },
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
          "connect-src 'self' http://localhost:11434",
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
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  process.stderr.write('[STARTUP] BrowserWindow created\n')
}

// ─── 앱 라이프사이클 ─────────────────────────────────────────
process.stderr.write('[STARTUP] main.ts loaded\n')

app.whenReady().then(() => {
  process.stderr.write(`[STARTUP] app.whenReady — v${app.getVersion()} (${process.platform})\n`)

  // zimg: 프로토콜 핸들러 — 로컬 파일을 렌더러에 안전하게 제공
  protocol.handle('zimg', (request) => {
    process.stderr.write(`[zimg] Raw Request: ${request.url}\n`)
    
    // zimg://D:/... 또는 zimg:D:/... 형태에서 접두어 제거
    // [\/]* 를 사용하여 슬래시가 0개 이상인 경우 모두 대응
    let filePath = request.url.replace(/^zimg:[\/]*/i, '')
    filePath = decodeURIComponent(filePath).split('?')[0]

    // Windows에서 D:/... 형태가 되도록 정규화
    filePath = path.normalize(filePath)

    try {
      if (!fs.existsSync(filePath)) {
        process.stderr.write(`[zimg] Not Found (Resolved): ${filePath}\n`)
        return new Response('Not Found', { status: 404 })
      }

      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
      
      process.stderr.write(`[zimg] Success: ${filePath} (${data.length} bytes)\n`)
      return new Response(data, { 
        headers: { 
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*' 
        } 
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
