const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { platform } = require('os')

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function kill(image) {
  try {
    execSync(`taskkill /IM ${image} /F`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function isFileLocked(filePath) {
  if (!fs.existsSync(filePath)) return false
  try {
    const fd = fs.openSync(filePath, 'r+')
    fs.closeSync(fd)
    return false
  } catch (err) {
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
      return true
    }
    return false
  }
}

function waitForUnlock(filePath, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (!isFileLocked(filePath)) return true
    sleep(500)
  }
  return !isFileLocked(filePath)
}

if (platform() === 'win32') {
  const exePath = path.join(__dirname, '..', 'release', 'win-unpacked', 'OpenLLM.exe')

  for (let attempt = 0; attempt < 5; attempt++) {
    kill('OpenLLM.exe')
    sleep(400)
  }

  console.log('[kill-openllm] waiting for OpenLLM.exe to unlock…')
  const unlocked = waitForUnlock(exePath, 30000)

  if (!unlocked && fs.existsSync(exePath)) {
    console.error('[kill-openllm] ERROR: OpenLLM.exe is still locked.')
    console.error('[kill-openllm] Close OpenLLM manually, then run build again.')
    process.exit(1)
  }

  if (unlocked) {
    console.log('[kill-openllm] ready to build')
  }
}
