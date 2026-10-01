# LocaLLMIDE

A Cursor-style local LLM-powered code editor built with Electron, React, and TypeScript. Run AI code assistance entirely on your own machine — no cloud, no API keys, no data leaving your device.

![Electron](https://img.shields.io/badge/Electron-35-blue) ![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Monaco Editor** — the same editor that powers VS Code, with syntax highlighting for 50+ languages and multi-tab support
- **Local LLM Chat** — stream responses from any GGUF model using [node-llama-cpp](https://github.com/withcatai/node-llama-cpp); no internet required
- **AI File Creation** — the AI can create and write files directly into your workspace from chat responses
- **Model Manager** — browse and download curated models, or search HuggingFace live for any GGUF file
- **File Explorer** — full workspace file tree with create, rename, delete support
- **Source Control** — built-in Git integration (stage, commit, push, pull, branch switching)
- **GitHub Panel** — view and manage repositories, issues, and pull requests via the GitHub API
- **Integrated Terminal** — real PTY terminal powered by node-pty and xterm.js
- **Settings** — configure model download folder, GPU layers, context size, threads, editor font/tab size, Git author, and GitHub PAT
- **Command Palette** — keyboard-driven command search (Ctrl+Shift+P)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- Windows 10/11 x64 (primary target; macOS/Linux untested)
- A GGUF model file (download one from the Model Manager inside the app)

### Install & Run

```bash
git clone https://github.com/singhhe/LocalLLMIDE.git
cd LocalLLMIDE
npm install
npm run dev
```

> **Note:** `npm install` runs `electron-rebuild` automatically to compile native modules (`node-pty`) for your Electron version. This may take a few minutes on first run.

---

## Using the AI

1. Open the AI panel from the activity bar (right side)
2. Click **Load Model** and select a `.gguf` file from your local drive, or use the **Model Manager** to download one
3. Type your request — the AI streams its response in real time
4. Code blocks with a `language:filepath` header are automatically written to your workspace

### Downloading Models

Click the **Models** icon in the activity bar to open the Model Manager:

- **Curated tab** — one-click download of popular models (Mistral, Llama 3, Phi-3, Gemma, DeepSeek, CodeGemma, and more)
- **Search HuggingFace tab** — live search across all GGUF models on HuggingFace, expand any result to pick a specific quantization file

Models are saved to the folder configured in Settings (defaults to your user data directory).

---

## Building a Distributable

### Portable ZIP (no code-signing required)

```bash
npm run build:win
```

Output: `release/LocaLLMIDE-<version>-win-x64.zip` — extract and run `LocaLLMIDE.exe`.

### NSIS Installer (requires Windows Developer Mode)

Enable **Developer Mode** in Windows Settings → System → For developers, then:

```bash
npm run build:win
```

Output: `release/LocaLLMIDE Setup <version>.exe`

> Developer Mode is required because the electron-builder signing toolchain extracts macOS dylib symlinks, which need the "Create symbolic links" privilege on Windows.

---

## Project Structure

```
src/
  main/               # Electron main process
    ipc/              # IPC handlers (fs, git, llm, settings, terminal)
    services/         # Business logic (FileService, LlmService, GitService, ...)
    index.ts          # Main entry point
    preload.ts        # Context bridge
  renderer/           # React frontend
    src/
      components/     # UI components (Editor, AiPanel, Sidebar, Terminal, ...)
      store/          # Zustand state stores
      styles/         # Global CSS and theme variables
  shared/
    types.ts          # Shared TypeScript types
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 35 |
| Frontend | React 18 + TypeScript |
| Build | electron-vite + Vite 6 |
| Editor | Monaco Editor |
| LLM runtime | node-llama-cpp v3 (llama.cpp) |
| Terminal | node-pty + xterm.js |
| Git | simple-git |
| GitHub API | @octokit/rest |
| State | Zustand |
| Packaging | electron-builder |

---

## License

MIT
