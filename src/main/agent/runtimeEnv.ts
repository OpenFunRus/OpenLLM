import os from 'os'
import type { RuntimeEnvironment } from '../../shared/agent/contextBuilder'

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const platform = os.platform()
  const shell =
    platform === 'win32'
      ? (process.env.COMSPEC?.includes('powershell') ? 'powershell' : 'powershell')
      : (process.env.SHELL?.split('/').pop() ?? 'bash')

  return {
    osPlatform: platform,
    osRelease: os.release(),
    shell,
    appName: 'OpenLLM'
  }
}
