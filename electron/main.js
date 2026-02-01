const { app, BrowserWindow, dialog, Menu } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const net = require('net')
const fs = require('fs')

function isDev() {
  return !app.isPackaged
}

function getRendererUrl() {
  const url = process.env.ELECTRON_RENDERER_URL
  if (url) return url
  return 'http://127.0.0.1:5173'
}

function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, host, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://')
    const lib = isHttps ? require('https') : require('http')
    const req = lib.get(url, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (c) => {
        raw += c
      })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, json: JSON.parse(raw) })
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function waitForHealth(baseUrl, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const { status, json } = await httpGetJson(`${baseUrl}/health`)
      if (status === 200 && json && json.status === 'ok') return
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw lastErr || new Error('backend healthcheck timeout')
}

function resolveBundledBackendExecutable() {
  const resources = process.resourcesPath
  const isWin = process.platform === 'win32'
  const exeName = isWin ? 'viper-backend.exe' : 'viper-backend'
  const exePath = path.join(resources, 'backend', exeName)
  console.log('Platform:', process.platform)
  console.log('Looking for backend at:', exePath)
  console.log('Resources path:', resources)
  const backendDir = path.join(resources, 'backend')
  if (fs.existsSync(backendDir)) {
    console.log('Backend dir contents:', fs.readdirSync(backendDir))
  } else {
    console.log('Backend dir not found at:', backendDir)
    if (fs.existsSync(resources)) {
      console.log('Resources dir contents:', fs.readdirSync(resources))
    }
  }
  return exePath
}

function startBackend({ port }) {
  const host = '127.0.0.1'
  const baseUrl = `http://${host}:${port}`
  const dbFileName = isDev() ? 'viper-dev.sqlite3' : 'viper.sqlite3'
  const dbPath = path.join(app.getPath('userData'), dbFileName)
  const childEnv = { ...process.env, VIPER_DB_PATH: dbPath }

  if (app.isPackaged) {
    const exePath = resolveBundledBackendExecutable()
    if (!fs.existsSync(exePath)) {
      throw new Error(`bundled backend not found: ${exePath}`)
    }
    const child = spawn(exePath, ['--host', host, '--port', String(port)], {
      windowsHide: true,
      stdio: 'ignore',
      env: childEnv,
    })
    return { child, baseUrl }
  }

  const python = process.env.PYTHON || 'python'
  const child = spawn(
    python,
    ['-m', 'uvicorn', 'backend.app.main:app', '--host', host, '--port', String(port)],
    { cwd: path.resolve(__dirname, '..'), windowsHide: true, env: childEnv },
  )
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
  return { child, baseUrl }
}

async function createWindow({ backendUrl }) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0b0b0b',
    autoHideMenuBar: true,
    titleBarOverlay: {
      color: '#0b0b0b',
      symbolColor: '#e6e6e6',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--backend-url=${backendUrl}`],
    },
  })
  win.setMenuBarVisibility(false)
  win.setMenu(null)

  if (isDev()) {
    await win.loadURL(getRendererUrl())
  } else {
    const indexPath = path.join(process.resourcesPath, 'renderer', 'index.html')
    await win.loadFile(indexPath)
  }

  return win
}

let backendChild = null

async function main() {
  try {
    const port = await findFreePort()
    const { child, baseUrl } = startBackend({ port })
    backendChild = child
    await waitForHealth(baseUrl)
    await createWindow({ backendUrl: baseUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : `${e}`
    try {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Viper',
        message: '启动失败',
        detail: msg,
      })
    } catch {
      void 0
    }
    app.quit()
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendChild && !backendChild.killed) {
    try {
      backendChild.kill()
    } catch (e) {
      void e
    }
  }
})

app.whenReady().then(main)

try {
  Menu.setApplicationMenu(null)
} catch {
  void 0
}
