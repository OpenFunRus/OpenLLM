'use strict'
// Ensure ELECTRON_RUN_AS_NODE is not set — electron-rebuild sets it to '1'
// which prevents Electron from initializing its browser process
delete process.env.ELECTRON_RUN_AS_NODE

const { spawn } = require('child_process')
const isWin = process.platform === 'win32'
const bin = require('path').resolve(__dirname, '../node_modules/.bin/electron-vite' + (isWin ? '.cmd' : ''))
const ps = spawn(bin, ['dev'], { stdio: 'inherit', env: process.env, shell: true })
ps.on('close', (code) => process.exit(code ?? 0))
