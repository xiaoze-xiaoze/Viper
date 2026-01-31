const { contextBridge } = require('electron')

function parseBackendUrlFromArgv(argv) {
  const prefix = '--backend-url='
  for (const arg of argv || []) {
    if (typeof arg !== 'string') continue
    if (!arg.startsWith(prefix)) continue
    const value = arg.slice(prefix.length).trim()
    if (!value) continue
    return value
  }
  return null
}

const backendUrl = parseBackendUrlFromArgv(process.argv) || 'http://127.0.0.1:8000'

contextBridge.exposeInMainWorld('VIPER', {
  backendUrl,
})

