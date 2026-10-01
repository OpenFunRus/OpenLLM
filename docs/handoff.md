# OpenLLM — handoff для переноса проекта

> **Как использовать:** скорми этот файл AI-ассистенту в начале новой сессии на другом компе. Это карта проекта, текущее состояние и инструкции по переносу.

**Дата:** 2026-10-01  
**Путь на исходной машине:** `D:\Cursor\OpenLLM`  
**Git:** репозиторий есть; **большая часть agent/streaming UI не закоммичена** (см. § Git)

---

## Что за проект

**OpenLLM** — локальный Electron IDE в стиле Cursor:

- Monaco Editor, explorer, Git, GitHub, терминал (node-pty)
- LLM через **OpenAI-compatible API** (локальный сервер / GGUF backend)
- AI-панель: режимы **Agent / Plan / Ask / Chat**
- Agent: multi-step ReAct, native `tool_calls` + fallback XML

**Стек:** Electron 35, React 18, TypeScript, Zustand, electron-vite, electron-builder  
**Целевая ОС:** Windows 10/11 x64

---

## Перенос на другой компьютер

### 1. Скопировать проект

**Вариант A — git (предпочтительно):**

```bash
git clone <remote-url> OpenLLM
cd OpenLLM
```

> На исходной машине сначала закоммить и запушить изменения (сейчас много uncommitted файлов — см. § Git).

**Вариант B — архив / папка:**

- Скопировать всю папку `OpenLLM`, **кроме** `node_modules/`, `out/`, `release/` (пересоберутся)
- Или использовать `OpenLLM.zip` если есть

### 2. Установка и запуск

```bash
cd OpenLLM
npm install          # postinstall: electron-rebuild для node-pty
npm run dev          # dev + Electron
```

### 3. Сборка production (Windows)

```bash
npm run build:dir
# → release/win-unpacked/OpenLLM.exe
```

Алиас: `npm run build:win` (то же самое).

### 4. Что перенести отдельно (не в git)

| Данные | Где лежит |
|--------|-----------|
| Настройки, API models, MCP | `%APPDATA%/OpenLLM/` или `.openllm/` в проекте |
| Chat sessions | сохраняются через IPC в userData |
| GGUF / model registry | пути в Settings → Model Manager |
| Workspace | любая папка, открывается через File → Open Folder |

### 5. Первый запуск на новом компе

1. `npm install && npm run build:dir`
2. Запустить `release\win-unpacked\OpenLLM.exe` (или `npm run dev`)
3. Settings → добавить API model (URL, model name, token)
4. Load model / выбрать active model
5. Open Folder → workspace
6. AI panel → режим **Agent** → тест «Создай hi.txt»

---

## Режимы AI

| Режим | Store | Backend |
|-------|-------|---------|
| **Chat** | `sendMessage` | `llm:generateStart`, markdown file blocks |
| **Agent** | `sendAgentMessage` | `agent:runStart` → `AgentOrchestrator` |
| **Plan** | `sendAgentMessage(mode: plan)` | те же tools, другой system prompt |
| **Ask** | `sendAgentMessage(mode: ask)` | read-only tools |

**Agent — основной режим.** Не использовать legacy chat для задач с файлами.

---

## Архитектура Agent (актуальная)

```
User → AiPanel.tsx
     → aiStore.sendAgentMessage()
     → preload: agentRunStart
     → ipc/agentHandlers.ts
     → AgentOrchestrator.run()
         → LlmService.completeAgentStream()   [native tool_calls + reasoning_content SSE]
         → fallback: completeMessagesStream() + XML parseToolCalls()
         → ToolExecutor.execute()             [sequential]
         → callbacks: onStepStart, onToken, onReasoningToken, onToolCallDelta, onStep, onTool
     → aiStore: beginAgentStep, appendAgentReasoningToken, appendAgentStreamToken,
                commitAgentStepThinking, appendToolEvent, agentProseBuffer
     → ChatMessage → AgentStepsTimeline
         → ThinkingBlock, AgentProseBlock, AgentToolBubble (FileDiffBody)
```

### Native vs XML tools

- **Native** (default если API поддерживает): OpenAI `tools` + `tool_calls` в SSE, `reasoning_content` deltas
- **XML fallback:** `<tool_call>Write(...)</tool_call>` — `xmlToolCallParser.ts`
- Переключение: `isNativeToolsEnabled()` в shared agent config

---

## Agent Streaming UI v1 (✅ реализовано)

Спека: [agent-streaming-ui.md](./agent-streaming-ui.md)

### UI-компоненты

| Компонент | Назначение |
|-----------|------------|
| `StreamBubble` | Единый shell: шапка + body / bodyNode, pinPreview, forceHeaderOnly |
| `ThinkingBlock` | «Думаю…» / «Думал Xs», reasoning stream |
| `AgentToolBubble` | Write/StrReplace/Delete/Shell/Todo/Task/… |
| `FileDiffBody` | Cursor-style diff: номера строк, +/- gutter, зелёный/красный фон |
| `AgentProseBlock` | Белый текст модели **между** tool bubbles (не внизу) |
| `AgentStepsTimeline` | Шаг N, interleaved: thinking → prose → tool → prose → tool |
| `streamFlush.ts` | rAF batching reasoning + tool pending (без jank) |

### Поведение стрима

- **Шаг N** — без `/30` (не показываем maxSteps)
- **Live timeline** с первого `stepStart` (не ждёт конца LLM)
- **Одна активная операция** во время стрима: рассуждение **или** текущий pending file — предыдущие схлопнуты в шапку
- **После done** — file bubbles показывают **4 строки** preview (pinPreview), шеврон раскрывает полный diff
- **Расширение файла** — цветной текст (JS жёлтый), без фона-таблетки
- **Prose interleaved** — `proseBlocks[]` в `AgentStepEntry`, commit перед каждым новым tool
- **Supersede errors** — ошибка Write скрывается если тот же файл потом успешно записан
- **Умный скролл** — если пользователь прокрутил вверх, автоскролл отключён; у низа (≤48px) — снова липнет

### Chat UX (✅)

| Фича | Файлы |
|------|-------|
| Ctrl+V скриншот в composer | `AiPanel.tsx` → `attachedImages` |
| Редактирование user message + resend | `ChatMessage.tsx`, `aiStore.editUserMessageAndResend` |
| Откат (↩) с restore файлов | `chatRollback.ts`, `aiStore.rollbackToUserMessage` |
| Windowing чата (~80 сообщений) | `AiPanel.tsx` MESSAGE_WINDOW |
| Mode dropdown (Agent/Plan/Ask/Chat) | `AiPanel.tsx`, `uiStore.composerMode` |

---

## Структура данных сообщения

```typescript
type AgentStepEntry = {
  step: number
  thinking?: string
  proseBlocks?: string[]   // prose перед tool[0], tool[1], …
  tools: AgentToolEvent[]
}

type ChatMessage = {
  content: string
  agentSteps?: AgentStepEntry[]
  agentReasoningBuffer?: string    // live reasoning
  agentProseBuffer?: string        // live prose (interleaved)
  streamingAgentStep?: number
  agentHasToolActivity?: boolean
  isStreaming?: boolean
  // ...
}

type AgentToolEvent = {
  step, name, toolId, status: 'pending' | 'done'
  filePath?, oldContent?, newContent?, streamBody?
  isError?
}
```

---

## Карта ключевых файлов

### Main process

| Область | Путь |
|---------|------|
| Orchestrator | `src/main/agent/AgentOrchestrator.ts` |
| Tool executor + tools | `src/main/agent/ToolExecutor.ts`, `src/main/agent/tools/*.ts` |
| Shell registry | `src/main/agent/shellRegistry.ts`, `ShellService.ts` |
| IPC agent | `src/main/ipc/agentHandlers.ts` |
| LLM SSE | `src/main/services/LlmService.ts` |
| File I/O + BOM | `src/main/services/FileService.ts`, `src/shared/sanitizeFileContent.ts` |
| Settings / MCP | `src/main/services/SettingsService.ts`, `mcpRegistry.ts` |
| Preload | `src/main/preload.ts` |

### Renderer

| Область | Путь |
|---------|------|
| AI store | `src/renderer/src/store/aiStore.ts` |
| Stream batching | `src/renderer/src/store/streamFlush.ts` |
| AI panel | `src/renderer/src/components/AiPanel/AiPanel.tsx` |
| Timeline | `AgentStepsTimeline.tsx` |
| Bubbles | `StreamBubble.tsx`, `ThinkingBlock.tsx`, `AgentToolBubble.tsx`, `FileDiffBody.tsx` |
| Chat message | `ChatMessage.tsx`, `messageContent.tsx` |
| Rollback UI | `ChatMessage.tsx` + `src/shared/agent/chatRollback.ts` |

### Shared agent

| Область | Путь |
|---------|------|
| Types | `src/shared/agent/types.ts` |
| Steps upsert | `src/shared/agent/agentSteps.ts` |
| Thinking parse | `src/shared/agent/thinkingBlocks.ts` |
| Tail preview | `src/shared/agent/tailPreview.ts` |
| Prompts | `src/shared/agent/prompts/*.ts`, `promptBuilder.ts` |
| Tool schemas | `docs/cursor/tools/agent-tools.json` |
| XML parser | `src/shared/agent/parsers/xmlToolCallParser.ts` |
| i18n (RU) | `src/shared/i18n.ts` |

### Docs

| Файл | Содержание |
|------|------------|
| [agent-streaming-ui.md](./agent-streaming-ui.md) | Спека streaming UI v1 |
| [cursor-parity-roadmap.md](./cursor/cursor-parity-roadmap.md) | Roadmap Cursor parity |
| [capture-findings.md](./cursor/capture-findings.md) | Перехват Cursor API |
| [agent-migration-plan.md](./cursor/agent-migration-plan.md) | План миграции tools |
| [cursor_agent.txt](./cursor/cursor_agent.txt) | Эталон system prompt |
| `docs/llms/u24r3090.md` | Железо / контекст |

---

## Что уже сделано (сводка)

### Backend

- [x] Multi-step agent loop, limits (`agentMaxSteps`, `agentMaxWallTimeMin`)
- [x] Native OpenAI tool_calls + reasoning_content SSE
- [x] XML tool_call fallback
- [x] Tools: Read, Write, StrReplace, Delete, Glob, Grep, Shell, AwaitShell, TodoWrite, CreatePlan, Task, AskQuestion, SwitchMode, …
- [x] Early tool delta streaming (`onToolCallDelta` → pending bubbles)
- [x] Shell output → Terminal mirror + stream in bubble
- [x] UTF-8 BOM strip, path resolve, sequential file tool execution
- [x] Agent session persistence per chat tab
- [x] MCP config UI + registry

### UI / Polish

- [x] Agent Streaming UI v1 (см. выше)
- [x] Settings: Agent limits, MCP
- [x] Global scrollbars, tab alignment, mode pill dropdown
- [x] Context usage ring, image attachments, lightbox
- [x] Plan panel, Todo panel
- [x] AskQuestion / SwitchMode modals
- [x] History closed sessions, multi-tab chat

### Известные фиксы

- [x] `process is not defined` в renderer → убран из App.tsx
- [x] Step «Шаг 1 / 30» → «Шаг 1»
- [x] Write empty contents → пустой файл, не error
- [x] Stale error bubble → supersede при успехе
- [x] Streaming jank → rAF batch + defer scheduleSave на pending

---

## Что ещё можно улучшить (не блокер)

| Задача | Заметки |
|--------|---------|
| Stream Router (`StreamBlock[]`) | Спека §3 в agent-streaming-ui.md — сейчас логика в aiStore + timeline |
| Virtual list (react-virtual) | Сейчас windowing ~80 msg, не полный virtual scroll |
| Chat mode file rollback | Edit/resend в chat — revert только agent tool events |
| Agent transcripts persistence | |
| Smart Mode approval cards | |
| Cloud Task subagents | Cursor cloud only |
| README update | Устарел, нет agent mode |
| Git commit + push | Вся работа локально uncommitted |

---

## Тест-план после переноса

1. `npm install && npm run build:dir`
2. Load API model, open workspace
3. **Agent:** «Привет» → thinking + prose
4. **Agent:** «Создай 3 файла» → sequential bubbles, один active при стриме, diff +/−
5. **Ctrl+V** скриншот в composer → send with image
6. **Rollback ↩** на user message → файлы откатились, сообщения обрезаны
7. **Edit ✎** user message → resend → откат + новый ответ
8. **Scroll** вверх во время стрима → не дёргает; вниз → липнет
9. Проверить файлы без BOM

---

## Git — важно

**HEAD:** `2370ae2` (старый commit — agent mode **не** в git history)

**Uncommitted (основное):**

- Весь `src/main/agent/`
- `src/shared/agent/`
- `docs/`
- AI panel components (AgentStepsTimeline, StreamBubble, FileDiffBody, …)
- `aiStore.ts`, `LlmService.ts`, settings, MCP, i18n

**Перед переносом через git:** закоммить и push, иначе на новом компе будет старая версия.

**Правило:** не коммитить без явной просьбы пользователя.

---

## Команды (шпаргалка)

```bash
npm run dev              # разработка
npm run build            # только out/
npm run build:dir        # release/win-unpacked/OpenLLM.exe
npm run generate:agent-tools
npm run validate:agent-tools
```

---

## LLM / модели

- API: OpenAI-compatible (Settings → Models)
- `customizeApiParams: false` → Cursor-like payload (model, messages, stream, tools)
- `reasoning_content` в SSE — для live thinking (зависит от backend)
- Доки по VRAM/контексту: `docs/llms/u24r3090.md`, `u24r2080.md`, `u24http.md`

---

*Последнее обновление: 2026-10-01 — Agent Streaming UI v1, diff bubbles, edit/rollback, paste, scroll, single-focus stream.*
