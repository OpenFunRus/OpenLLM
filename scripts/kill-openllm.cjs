const { execSync } = require('child_process')
const { platform } = require('os')

function kill(image) {
  try {
    execSync(`taskkill /IM ${image} /F`, { stdio: 'ignore' })
  } catch {
    /* процесс не запущен */
  }
}

if (platform() === 'win32') {
  kill('OpenLLM.exe')
}
