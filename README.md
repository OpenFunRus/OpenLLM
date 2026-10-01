# OpenLLM

Локальная IDE в стиле Cursor: редактор, терминал, Git и AI-агент поверх **OpenAI-compatible API** (локальный llama.cpp server, vLLM, LM Studio, OpenRouter и т.д.).

![Electron](https://img.shields.io/badge/Electron-35-blue) ![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

---

## Зачем это

OpenLLM — попытка собрать «свой Cursor» на своей машине:

- код и промпты не уходят в облако Cursor (куда именно — зависит от вашего API endpoint);
- полный контроль над моделью, контекстом и лимитами;
- agent loop с инструментами как в Cursor: чтение/правка файлов, shell, grep, план, subagents.

**Целевая ОС:** Windows 10/11 x64 (основная). macOS/Linux не тестировались.

---

## Возможности

### Редактор и workspace

- **Monaco Editor** — подсветка синтаксиса, вкладки, diff в чате
- **Markdown preview** — переключение raw / GitHub-style для `.md`
- **Explorer** — дерево файлов, создание, переименование, удаление
- **Терминал** — PTY (node-pty + xterm.js), ресайз вместе с панелями

### Git и GitHub

- **Source Control** — stage, commit, push, pull, ветки
- **GitHub panel** — репозитории, PR через PAT

### AI-режимы

| Режим | Назначение |
|-------|------------|
| **Agent** | Автономный цикл: LLM → tools → результат в контекст |
| **Plan** | План в `.openllm/plans/`, кнопка «Реализовать» → Agent |
| **Ask** | Только чтение (grep, read), без правок файлов |
| **Chat** | Обычный чат + markdown-блоки с файлами |

### Agent (основной режим)

- Native **tool_calls** (OpenAI API) + fallback на XML tool calls
- Стриминг: reasoning, prose, tool bubbles, diff по файлам
- **Shell** — команды в фоне, вывод в bubble и терминал
- **Rollback / Edit** — откат к сообщению с восстановлением файлов и пустых папок
- **Stop** — прерывание LLM, tools и shell-процессов
- **Batch + auto-continue** — длинные задачи без обрыва на 30 шагах (как в Cursor)
- **SwitchMode / AskQuestion** — модалки подтверждения от агента
- **MCP** — конфиг `mcp.json` (user / workspace scope)

### Настройки агента (по умолчанию)

- 50 шагов за batch, auto-continue включён
- 60 мин на batch, safety cap 500 шагов
- Пауза batch при ~92% контекста модели

---

## Быстрый старт

### Требования

- [Node.js](https://nodejs.org/) 18+
- Windows 10/11 x64
- Запущенный **OpenAI-compatible** inference server (или облачный endpoint)

### Установка

```bash
git clone https://github.com/OpenFunRus/OpenLLM.git
cd OpenLLM
npm install
npm run dev
```

> `npm install` пересобирает native-модули (`node-pty`) под ваш Electron.

### Первый запуск

1. **Settings → Models** — добавьте API model: URL, `model` name, token (если нужен)
2. Загрузите модель (**Load model**)
3. **File → Open Folder** — откройте workspace
4. AI panel → режим **Agent** → например: «Создай hello.txt с текстом Hi»

Пример локального сервера (llama.cpp):

```bash
# на вашей машине, отдельно от OpenLLM
llama-server -m model.gguf --port 8080
```

В настройках модели URL: `http://127.0.0.1:8080/v1/chat/completions`

---

## Сборка (Windows)

```bash
npm run build:win
```

Результат: `release/win-unpacked/OpenLLM.exe`

Подпись отключена (`signAndEditExecutable: false`) — для dev-сборки на Windows без Developer Mode.

---

## MCP

Пример конфига: [`.openllm/mcp.json.example`](.openllm/mcp.json.example)

- **User scope:** `%APPDATA%/OpenLLM/mcp.json`
- **Workspace scope:** `<project>/.openllm/mcp.json`

Формат как в Cursor: `{ "mcpServers": { "name": { "command": "...", "args": [] } } }`

---

## Структура проекта

```
src/
  main/                 # Electron main process
    agent/              # AgentOrchestrator, tools, ShellService
    ipc/                # IPC handlers
    services/           # LlmService, FileService, GitService, ...
  renderer/             # React UI
    components/         # Editor, AiPanel, Terminal, Modals, ...
    store/              # Zustand (aiStore, editorStore, ...)
  shared/               # types, agent prompts, i18n, rollback
docs/
  handoff.md            # карта проекта для переноса / онбординга
```

---

## Стек

| Слой | Технология |
|------|------------|
| Shell | Electron 35 |
| UI | React 18 + TypeScript |
| Сборка | electron-vite + Vite 6 |
| Редактор | Monaco Editor |
| LLM | OpenAI-compatible HTTP API (streaming, tool_calls) |
| Терминал | node-pty + xterm.js |
| Git | simple-git |
| GitHub | @octokit/rest |
| State | Zustand |
| MCP | @modelcontextprotocol/sdk |
| Пакет | electron-builder |

---

## Данные вне репозитория

| Что | Где |
|-----|-----|
| Settings, chat sessions | `%APPDATA%/OpenLLM/` |
| Agent terminals | `%APPDATA%/OpenLLM/agent-sessions/` |
| MCP (user) | `%APPDATA%/OpenLLM/mcp.json` |
| Workspace | любая папка через Open Folder |

---

## Документация

- [docs/handoff.md](docs/handoff.md) — handoff, архитектура agent, streaming UI
- [docs/agent-streaming-ui.md](docs/agent-streaming-ui.md) — спека UI стрима
- [docs/cursor/](docs/cursor/) — заметки по паритету с Cursor

---

## Лицензия

MIT
