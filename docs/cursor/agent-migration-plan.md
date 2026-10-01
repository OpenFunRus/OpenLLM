# План: Agent Mode как в Cursor для OpenLLM

Документ описывает путь от текущей схемы «один промпт → один ответ с текстовыми директивами» к полноценному **agent loop с tool calling**, максимально близкому к перехвату `cursor_agent.txt`.

Источники:

- `docs/cursor/cursor_agent.txt` — Agent mode
- `docs/cursor/cursor_plan.txt` — Plan mode (доп. tool `CreatePlan`)
- `docs/cursor/cursor_ask.txt` — Ask mode (read-only subset)
- Текущая архитектура OpenLLM (`LlmService`, `aiStore`, IPC handlers)

---

## 1. Цель

Сделать режим **Agent** в OpenLLM, где модель:

1. Получает system prompt и набор tools как в Cursor.
2. Вызывает tools в цикле (read → edit → shell → …).
3. Получает результаты tools обратно в контекст.
4. Продолжает до завершения задачи или лимита шагов.
5. Показывает пользователю прогресс (tool calls, diff, terminal output).

**Не цель v1:** побайтная копия всей инфраструктуры Cursor (cloud agents, Smart Mode approval, agent transcripts, skills, multitask mode).

---

## 2. Текущее состояние OpenLLM

### Как работает сейчас

```
User → aiStore.sendMessage()
     → IPC llm:generateStart
     → LlmService.generate()  [один HTTP-запрос, stream]
     → парсинг текста: ```lang:path```, DELETE:, RUN:
     → частичное авто-применение (write) + ручные кнопки (delete/run)
```

### Что уже есть (IPC / сервисы)


| Область                        | Реализация             | Файлы                                 |
| ------------------------------ | ---------------------- | ------------------------------------- |
| Read/Write/Delete/Mkdir/Rename | `FileService`          | `fsHandlers.ts`                       |
| File tree + watch              | chokidar               | `fsHandlers.ts`, `workspaceStore`     |
| Terminal PTY                   | node-pty, один session | `TerminalService.ts`                  |
| Git                            | simple-git             | `gitHandlers.ts`, `SourceControl.tsx` |
| GitHub                         | Octokit                | `githubHandlers.ts`                   |
| LLM streaming                  | OpenAI-compatible API  | `LlmService.ts`                       |
| Chat sessions                  | Zustand + JSON persist | `aiStore.ts`                          |
| Context ring                   | tiktoken estimate      | `chatTokenCount.ts`                   |


### Чего нет

- Agent loop (multi-turn tool execution)
- Native `tools` / `tool_calls` в API-запросе
- Парсер `<tool_call>` / OpenAI function calling
- Grep, Glob, Read с номерами строк
- Structured shell (stdout/stderr/exit code → модель)
- Context injection (open files, selection, linter, @mentions)
- Subagents (`Task`)
- MCP (`GetDynamicTools`, `CallDynamicTool`)
- ReadLints integration
- WebSearch / WebFetch

---

## 3. Полный каталог tools Cursor (Agent mode)

Из перехвата `cursor_agent.txt` — **19 tools** в system prompt:

### 3.1 Файловая система и код


| Tool             | Назначение                                              | Приоритет для OpenLLM |
| ---------------- | ------------------------------------------------------- | --------------------- |
| **Read**         | Чтение файла с `LINE|CONTENT`, offset/limit, images/PDF | P0 — must have        |
| **Write**        | Создание/перезапись файла                               | P0                    |
| **StrReplace**   | Точечная замена текста (old/new, replace_all)           | P0                    |
| **Delete**       | Удаление файла                                          | P0                    |
| **Glob**         | Поиск файлов по glob, сортировка по mtime               | P0                    |
| **Grep**         | ripgrep: content / files / count, regex, multiline      | P0                    |
| **EditNotebook** | Редактирование .ipynb cells                             | P3 — позже            |


### 3.2 Shell и процессы


| Tool           | Назначение                                          | Приоритет |
| -------------- | --------------------------------------------------- | --------- |
| **Shell**      | Команды, cwd, timeout, background, notify_on_output | P0        |
| **AwaitShell** | Poll background shell / sleep                       | P1        |


Cursor Shell — не просто PTY keystroke: stateful cwd, terminal files, background jobs, notifications.

### 3.3 Качество кода и UI


| Tool            | Назначение                     | Приоритет |
| --------------- | ------------------------------ | --------- |
| **ReadLints**   | Diagnostics по файлам/папкам   | P1        |
| **TodoWrite**   | In-session todo list           | P1        |
| **AskQuestion** | Structured MCQ от пользователя | P2        |


### 3.4 Web и внешние источники


| Tool          | Назначение           | Приоритет |
| ------------- | -------------------- | --------- |
| **WebSearch** | Поиск в интернете    | P2        |
| **WebFetch**  | Fetch URL → markdown | P2        |


### 3.5 Оркестрация и расширения


| Tool                 | Назначение                            | Приоритет |
| -------------------- | ------------------------------------- | --------- |
| **Task**             | Subagents (explore, shell, bugbot, …) | P3        |
| **GetDynamicTools**  | Discovery MCP/catalog                 | P3        |
| **CallDynamicTool**  | Invoke MCP tool                       | P3        |
| **FetchMcpResource** | MCP resources                         | P3        |
| **SwitchMode**       | Agent ↔ Plan                          | P2        |


### 3.6 Только в Plan mode (не в Agent intercept)


| Tool           | Назначение                |
| -------------- | ------------------------- |
| **CreatePlan** | Сохранить plan.md с todos |


---

## 4. Формат промпта Cursor vs OpenLLM

### 4.1 Структура Cursor Agent prompt

```
# Tools
<tools>[ JSON schemas × N ]</tools>

[правила вызова: redacted_thinking + tool_call XML]

[identity: coding agent in Cursor IDE]

<system-communication> … </system-communication>
<tone_and_style> … </tone_and_style>
<tool_calling> … </tool_calling>
<making_code_changes> … </making_code_changes>
<linter_errors> … </linter_errors>
<citing_code> … </citing_code>          ← startLine:endLine:filepath
<inline_line_numbers> … </inline_line_numbers>
<terminal_files_information> … </terminal_files_information>
<task_management> … </task_management>
<ask_question_guidance> … </ask_question_guidance>
<dynamic_tools> … </dynamic_tools>
<mode_selection> … </mode_selection>
```

### 4.2 Текущий OpenLLM prompt (`systemPrompt.ts`)

- Русский язык, жёсткие директивы: ````language:path````, `DELETE:`, `RUN:`
- Нет tool schemas
- Нет правил citing_code Cursor-формата
- Нет context injection blocks

### 4.3 Рекомендуемая адаптация промпта для OpenLLM

**Не копировать 1:1.** Заменить:


| Cursor                                                          | OpenLLM                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| «You operate in Cursor»                                         | «You operate in OpenLLM IDE»                                |
| `terminals folder: C:\Users\...\.cursor\projects\...\terminals` | `terminals folder: {openllmSessionDir}/terminals`           |
| Cursor-specific subagents                                       | OpenLLM subagent types (если будут)                         |
| `Smart Mode` / `request_smart_mode_approval`                    | Наша система approval (см. вопросы)                         |
| Skills / agent_transcripts blocks                               | OpenLLM rules/skills (если добавим)                         |
| `redacted_thinking` tag name                                    | Можно оставить или переименовать в `thinking` — см. вопросы |


**Сохранить логику:**

- Read before edit
- Prefer StrReplace over Write for edits
- Prefer Grep/Glob over shell grep/find
- Git safety protocol (из Shell tool description)
- citing_code: `startLine:endLine:filepath`
- Tool batching (parallel independent calls)

**Убрать / отложить из промпта v1:**

- MCP sections (пока нет MCP)
- Task/subagent instructions (пока нет Task)
- SwitchMode (пока один режим Agent)
- terminal_files metadata format Cursor-specific (адаптировать под наш формат)

**Файловая структура промптов (предложение):**

```
src/shared/agent/
  prompts/
    agent.system.ts      # основной system prompt (sections)
    tools/               # JSON schemas per tool
      read.json.ts
      write.json.ts
      ...
  promptBuilder.ts       # сборка: mode + tools + user context
  contextBuilder.ts      # open files, workspace, git, etc.
```

---

## 5. Формат tool calling — **ЗАФИКСИРОВАНО**

> **Решение (Q1):** формат вызова tools **строго как в Cursor, без изменений**. Не использовать OpenAI native `tool_calls`, не менять XML-разметку, не вводить альтернативные форматы.

Cursor в перехвате использует **XML**, не чистый OpenAI JSON:

```xml
<think>
Brief explanation of tool call
</think>
<tool_call>
<function=Read>
<parameter=path>
d:\project\src\main.ts
</parameter>
</function>
</tool_call>
```

### Правила (1:1 с `cursor_agent.txt`)


| Элемент           | Формат                                                                           |
| ----------------- | -------------------------------------------------------------------------------- |
| Reasoning         | `<think>…</think>` — весь reasoning только внутри                                |
| Tool call wrapper | `<tool_call>…</tool_call>` — отдельный блок на каждый tool                       |
| Function          | `<function=ToolName>…</function>`                                                |
| Parameters        | `<parameter=argName>\nvalue\n</parameter>` — значение может быть многострочным   |
| Несколько tools   | Несколько **отдельных** `<tool_call>` блоков в одном ответе, **без вложенности** |
| Отступы           | `<tool_call>` и `<function>` — **в начале строки**, без пробелов перед тегом     |
| Schemas в prompt  | `<tools>\n{JSON}\n{JSON}\n</tools>` — один JSON-object на строку                 |


### Реализация в OpenLLM

- Константы и инструкции: `src/shared/agent/toolCallFormat.ts`
- Schemas (19 tools): `src/shared/agent/tools/cursorAgentSchemas.ts` (генерируется из перехвата)
- Парсер (Этап 4): `src/main/agent/parsers/xmlToolCallParser.ts` — разбирает **именно этот** формат
- В API-запрос **не** передаём OpenAI `tools` / `tool_calls`; schemas только в system prompt текстом
- Streaming: буферизация до закрытия `</tool_call>`

### Agent loop (main process)

```
AgentOrchestrator.run(userMessage):
  messages = [system + <tools> block, ...history, user + context]
  loop maxSteps (e.g. 25):
    response = await LlmService.complete(messages)   # plain text, no OpenAI tools API
    parsed = xmlToolCallParser.parse(response)
    if parsed.toolCalls.length === 0:
      return final text to UI
    for each tool_call (parallel if independent):
      result = ToolExecutor.execute(call)
      append tool result to messages (Cursor-compatible format)
    continue
```

Orchestrator лучше в **main process** (рядом с FileService, Terminal), renderer только UI.

---

## 6. Маппинг tools → OpenLLM implementation

### Phase 0 — Tool definitions only (schemas + stubs)

Создать `src/shared/agent/tools/` — JSON schemas и TypeScript types **без исполнения**. Цель: зафиксировать контракт 1:1 с Cursor.

### Phase 1 — Core tools (P0)


| Cursor Tool | OpenLLM backend                                  | Новый IPC?                           |
| ----------- | ------------------------------------------------ | ------------------------------------ |
| Read        | `FileService.read` + line numbers + image base64 | `agent:read` или расширить `fs:read` |
| Write       | `FileService.write`                              | `fs:write` ✓                         |
| StrReplace  | **новый** `applyPatch(old, new)`                 | `agent:strReplace`                   |
| Delete      | `FileService.delete`                             | `fs:delete` ✓                        |
| Glob        | **новый** fast-glob / ripgrep --files            | `agent:glob`                         |
| Grep        | **новый** `@vscode/ripgrep` or spawn `rg`        | `agent:grep`                         |
| Shell       | **новый** `ShellService` (не PTY keystroke)      | `agent:shell`                        |


### Phase 2 — Shell infrastructure (P1)


| Cursor Tool      | OpenLLM backend                               |
| ---------------- | --------------------------------------------- |
| AwaitShell       | Job registry + terminal snapshot files        |
| Shell background | `block_until_ms`, output files in session dir |


Формат terminal file (адаптация Cursor):

```
---
pid: 12345
cwd: d:\project
last_command: npm test
running_for_ms: 15000
---
(stdout/stderr body)
---
exit_code: 0
elapsed_ms: 14200
---
```

### Phase 3 — Context & quality (P1)


| Cursor Tool | OpenLLM backend                            |
| ----------- | ------------------------------------------ |
| ReadLints   | Monaco markers / eslint CLI / tsc --noEmit |
| TodoWrite   | In-memory + optional persist in session    |


### Phase 4 — UX & extras (P2)


| Cursor Tool | OpenLLM backend                              |
| ----------- | -------------------------------------------- |
| AskQuestion | Modal in renderer, blocks agent until answer |
| WebSearch   | External API (Brave/Tavily)                  |
| WebFetch    | node fetch + html-to-md                      |
| SwitchMode  | UI mode switch Agent/Plan/Ask                |


### Phase 5 — Advanced (P3)


| Cursor Tool  | OpenLLM backend         |
| ------------ | ----------------------- |
| Task         | Child agent sessions    |
| MCP tools    | MCP client in main      |
| EditNotebook | ipynb JSON parser       |
| CreatePlan   | Plan mode artifact file |


---

## 7. Context injection (как у Cursor)

Cursor автоматически добавляет к user message:

- `<user_info>` — OS, shell, workspace path, git status
- `<open_and_recently_viewed_files>`
- `<attached_files>` / @mentions
- `<system_reminder>`, linter errors
- `<dynamic_tool_catalog>` — MCP namespaces

### OpenLLM v1 context bundle

```xml
<user_info>
OS: win32
Shell: powershell
Workspace: d:\project
Git repo: yes/no, branch: main
</user_info>

<open_files>
- d:\project\src\App.tsx (active, cursor line 42)
</open_files>

<workspace_snapshot optional="true">
(top-level dirs, package.json scripts summary)
</workspace_snapshot>
```

Источники данных уже в приложении:

- `workspaceStore.current.path`
- `editorStore` tabs + active tab
- `gitStore` / `git:info`
- Monaco cursor position (нужно добавить в store)

---

## 8. UI изменения

### 8.1 Режим Agent в composer

Сейчас pill «Agent» disabled. Нужно:

- **Chat** — текущий single-turn (legacy prompt или simplified)
- **Agent** — agent loop + tools
- (Позже) **Plan**, **Ask** — отдельные prompts из `cursor_plan.txt`, `cursor_ask.txt`

### 8.2 Отображение tool calls

Как Cursor:

- Collapsible blocks: «Read App.tsx», «StrReplace aiStore.ts», «Shell npm test»
- Diff preview для Write/StrReplace
- Terminal output inline для Shell

### 8.3 Убрать дублирование legacy

Сейчас параллельно:

- Auto `writeFile` из code fences в `aiStore`
- Manual Apply/Delete/Run в `ChatMessage`

**В Agent mode:** только tools, **без** парсинга `DELETE:`/`RUN:`/fences (или legacy fallback только для Chat mode).

---

## 9. Несоответствия и риски

### 9.1 Архитектурные


| #   | Несоответствие                                      | Решение                                                             |
| --- | --------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Single-turn vs agent loop                           | Новый `AgentOrchestrator`, не ломать `sendMessage` сразу            |
| 2   | LlmService history в main vs UI sessions в renderer | Единый `AgentSession` state в main, sync в renderer                 |
| 3   | Terminal = PTY UI vs Shell = structured exec        | Отдельный `ShellService`; PTY для интерактива пользователя          |
| 4   | Auto-write файлов vs StrReplace-only Cursor         | Agent: только tools; отключить auto-write                           |
| 5   | Нет ripgrep bundled                                 | Добавить `@vscode/ripgrep` или требовать `rg` в PATH                |
| 6   | Windows paths vs POSIX в промпте                    | Context всегда абсолютные Windows paths; quoting rules в Shell tool |
| 7   | Модели без tool calling                             | XML parser on assistant text; prompt instructs format               |
| 8   | Context size                                        | tool results могут быть huge → truncate + Read with limit           |
| 9   | Безопасность Shell                                  | Sandbox/allowlist? Approval для destructive ops?                    |
| 10  | Streaming + tool parse                              | Buffer until `</tool_call>` or use non-stream for agent steps       |


### 9.2 Prompt / parity gaps


| Cursor feature                | OpenLLM gap                                          |
| ----------------------------- | ---------------------------------------------------- |
| Agent skills                  | Нет `.cursor/skills` — можно `.openllm/skills` позже |
| Rules                         | Нет `.cursor/rules` — можно `AGENTS.md`              |
| @ file/folder mentions        | Нет parser в composer                                |
| Multitask / background agents | Нет                                                  |
| Smart Mode approval cards     | Нет                                                  |
| Composer-2.5-fast routing     | Любая user-configured model                          |


### 9.3 Что НЕ нужно копировать в v1

- Cloud subagents / worktrees
- `request_smart_mode_approval`
- Agent transcript JSONL citations
- Cursor-specific branding in prompt
- Full MCP catalog from user machine

---

## 10. Поэтапный план реализации

### Этап 0 — Спецификация (текущий документ + ваши ответы)

- [ ] Утвердить список tools v1
- [ ] Выбрать формат tool calling (XML vs OpenAI)
- [ ] Выбрать approval policy
- [ ] Решить судьбу legacy Chat mode

**Deliverable:** `docs/cursor/tools/*.schema.json` + types

---

### Этап 1 — Tool schemas и registry (без UI) ✅

```
src/shared/agent/
  types.ts
  toolCallFormat.ts          # XML format constants (Cursor 1:1)
  tools/
    cursorAgentSchemas.ts    # auto-generated from cursor_agent.txt
    index.ts                 # registry, formatToolsPromptBlock()
docs/cursor/tools/
  agent-tools.json           # canonical JSON snapshot
scripts/
  generate-agent-tools.mjs
  validate-agent-tools.mjs
```

- JSON schemas **идентичны Cursor** — генерируются из `cursor_agent.txt` (`npm run generate:agent-tools`)
- Все **19 tools** Agent mode (не только P0)
- `getToolSchemas(mode)`, `formatToolsPromptBlock()` — сборка `<tools>` блока
- Валидация: `npm run validate:agent-tools` — сверка с перехватом

**Deliverable:** только definitions + validate script (без agent loop и UI)

---

### Этап 2 — ToolExecutor stubs + IPC ✅

```
src/main/agent/
  AgentToolContext.ts
  ToolExecutor.ts
  tools/ read, write, strReplace, delete, stub
  parsers/xmlToolCallParser.ts   (shared)
src/main/ipc/agentHandlers.ts
```

- IPC: `agent:executeTool`, `agent:executeTools`, `agent:parseToolCalls`
- Preload: `window.api.agentExecuteTool`, …
- **P0 реализовано:** Read, Write, StrReplace, Delete, Glob, Grep, Shell
- Schemas для **agent / plan / ask** из перехватов

---

### Этап 3 — Core tool implementations (P0) ✅

- **Glob** — `fast-glob`, sort by mtime
- **Grep** — `@vscode/ripgrep`
- **Shell** — `ShellService` (spawn, timeout → background, terminal files)
- Зависимости: `fast-glob`, `@vscode/ripgrep`

---

### Этап 4 — AgentOrchestrator + LlmService ✅

- `LlmService.completeMessages()` — non-stream, без мутации chat history
- `AgentOrchestrator.run()` — XML parse → tools → `<tool_result>` loop
- IPC: `agent:runStart`, events `agent:tool|step|done|error`
- Лимиты из Settings: `agentMaxSteps`, `agentMaxWallTimeMin`, `agentContextStopPercent`

---

### Этап 5 — Prompt + context injection ✅

- `promptBuilder.ts` + `prompts/agentSystemBody.ts` (OpenLLM identity, Cursor rules)
- `contextBuilder.ts` — `<user_info>`, `<open_and_recently_viewed_files>`, `<timestamp>`, `<user_query>`
- **user_info:** OS, shell, workspace, git, date, terminals folder
- **timestamp:** локальные дата/время + UTC offset

---

### Этап 6 — UI Agent mode (базово) ✅ / polish ⏳

- ✅ Agent pill переключает Chat ↔ Agent (default Agent)
- ✅ `sendAgentMessage` → agent loop
- ⏳ Collapsible tool blocks, thinking UI
- ⏳ Stop → abort orchestrator (wired via stopFn)
- ⏳ Отключить legacy auto-write в agent sessions

---

### Этап 7 — P1 tools & polish

- AwaitShell + terminal files
- ReadLints (Monaco diagnostics)
- TodoWrite UI
- Context injection (open files, git branch)

---

### Этап 8 — P2/P3 (по необходимости)

- AskQuestion modal
- WebSearch/Fetch
- Plan/Ask modes + CreatePlan
- Task subagents
- MCP integration

---

## 11. Предлагаемая структура каталогов (target)

```
src/
  shared/agent/
    prompts/
    tools/
    types.ts
    promptBuilder.ts
    contextBuilder.ts
  main/
    agent/
      AgentOrchestrator.ts
      ToolExecutor.ts
      ShellService.ts
      TerminalSnapshotService.ts
      parsers/
        xmlToolCallParser.ts
      tools/
        read.ts
        grep.ts
        ...
    ipc/
      agentHandlers.ts
  renderer/
    components/AiPanel/
      AgentToolCall.tsx
      AgentProgress.tsx
    store/
      agentStore.ts          # or extend aiStore
```

---

## 12. Решения — **УТВЕРЖДЕНО**

> Chat mode и Plan mode — **позже**, перехваты: `cursor_ask.txt`, `cursor_plan.txt`. Schemas для всех трёх режимов уже генерируются (`npm run generate:agent-tools`).

| # | Решение |
|---|---------|
| Q1 | XML tool calls 1:1 Cursor ✅ |
| Q2 | Legacy Chat отдельно; Agent — новый режим ✅ |
| Q3 | **Settings:** `agentAutoApply`, default **`true`** (автоприменение) ✅ |
| Q4 | ShellService (spawn) + mirror в Terminal panel ✅ |
| Q5 | Bundle `@vscode/ripgrep` — см. §12.1 ✅ |
| Q6 | English prompt + reply in user language ✅ |
| Q7 | `<think>` — collapsed в UI, не в финальном ответе ✅ |
| Q8 | Task/subagents — после stable single-agent loop ✅ |
| Q9 | MCP — после P0 tools ✅ |
| Q10 | **Settings:** см. §12.2, defaults ниже ✅ |

### 12.1 Q5 — Ripgrep (простыми словами)

**Ripgrep (`rg`)** — быстрый поиск текста по файлам проекта (как Ctrl+Shift+F в Cursor). Tool **Grep** в Agent mode использует именно его, а не shell-команды `grep`/`find`.

**Решение:** встроить `@vscode/ripgrep` в OpenLLM — Grep/Glob работают «из коробки» на Windows без установки `rg` пользователем.

### 12.2 Q3 + Q10 — поля в Settings

Код: `src/shared/agent/agentSettings.ts`, `AppSettings` в `types.ts`.

| Ключ | Default | Описание |
|------|---------|----------|
| `agentAutoApply` | `true` | Write/StrReplace/Delete через tools без диалога подтверждения |
| `agentMaxSteps` | `30` | Max tool-call итераций на одно сообщение пользователя |
| `agentMaxWallTimeMin` | `10` | Max wall time agent run (минуты) |
| `agentContextStopPercent` | `85` | Остановка при превышении % контекста модели |

UI секции Agent в Settings — **Этап 6** (вместе с включением Agent mode).


---

## 12b. Вопросы (архив)

### Q1. Формат tool calling — **РЕШЕНО**

- [x] **A)** XML как в Cursor (`<tool_call><function=Read>…`) — **выбрано, формат не менять**
- [ ] **B)** OpenAI native `tools` + `tool_calls`
- [ ] **C)** Hybrid

**Решение:** только **A**. Schemas в prompt текстом; вызовы парсятся из assistant text как XML.

---

### Q2. Legacy Chat mode — **РЕШЕНО**

- [x] **A)** Оставить текущий prompt (`DELETE:`/`RUN:`/fences) как отдельный режим «Chat»
- [ ] **B)** Полностью заменить на Agent
- [ ] **C)** Chat = Agent без tools (простой Q&A)

---

### Q3. Авто-применение изменений — **РЕШЕНО**

- [ ] **A)** Agent: все writes через tools, без подтверждения (как Cursor)
- [ ] **B)** Agent: StrReplace/Write/Delete требуют approval в UI
- [x] **C)** Настройка в Settings

**Решение:** **C**, default **`agentAutoApply: true`** — автоприменение как в Cursor; пользователь может выключить в Settings.

---

### Q4. Shell execution — **РЕШЕНО**

- [ ] **A)** Новый `ShellService` (spawn, capture output) — отдельно от PTY
- [ ] **B)** Только через существующий PTY (как сейчас RUN:)
- [x] **C)** A + mirror output в Terminal panel

---

### Q5. Ripgrep — **РЕШЕНО**

- [x] **A)** Bundle `@vscode/ripgrep` в приложение
- [ ] **B)** Требовать `rg` в PATH пользователя
- [ ] **C)** Fallback на медленный JS search если нет rg

**Решение:** **A** — portable Windows, Grep tool без зависимости от PATH. См. §12.1.

---

### Q6. Язык system prompt — **РЕШЕНО**

- [ ] **A)** English как Cursor (лучше для моделей)
- [ ] **B)** Russian как сейчас
- [x] **C)** English prompt + «reply in user's language»

---

### Q7. Thinking block — **РЕШЕНО**

- [x] **A)** Скрытый `<thinking>` (показывать collapsed в UI)
- [ ] **B)** Не использовать — модель reasoning in tool loop only
- [ ] **C)** Как Cursor `<think>` — never show user

**Решение:** **A** — в промпте тег `<think>` как в Cursor; в UI — сворачиваемый блок, не часть ответа пользователю.

---

### Q8. Subagents (Task tool) в v1? — **РЕШЕНО**

- [x] **A)** Нет, отложить
- [ ] **B)** Упрощённый Task: один child session, no background
- [ ] **C)** Полный parity с Cursor Task

---

### Q9. MCP в v1? — **РЕШЕНО**

- [x] **A)** Нет
- [ ] **B)** Read-only catalog stub
- [ ] **C)** Full MCP client

---

### Q10. Max agent steps / budget — **РЕШЕНО**

- [x] Вынести в **Settings** (`AppSettings`, §12.2)
- Defaults: **30** steps, **10** min wall, stop at **85%** context

---

## 13. Первый конкретный шаг

**Этап 1: tool definitions** — **выполнен**

1. ✅ `src/shared/agent/tools/` — все 19 schemas из `cursor_agent.txt`
2. ✅ `src/shared/agent/types.ts`, `toolCallFormat.ts`
3. ✅ `npm run validate:agent-tools` — сверка с перехватом
4. ⏳ `agent.system.ts` — порт секций промпта (Этап 5)

**Следующий шаг:** UI polish (tool blocks, thinking collapsed), Plan/Ask modes.

---

## 14. Checklist parity Cursor Agent


| Capability           | Cursor | OpenLLM now       | Target v1 |
| -------------------- | ------ | ----------------- | --------- |
| Tool loop            | ✓      | ✗                 | ✓         |
| Read w/ line numbers | ✓      | partial (fs:read) | ✓         |
| StrReplace           | ✓      | ✗                 | ✓         |
| Grep/Glob            | ✓      | ✗                 | ✓         |
| Shell w/ output      | ✓      | partial           | ✓         |
| Context injection    | ✓      | ✗                 | partial   |
| citing_code format   | ✓      | ✗                 | ✓         |
| ReadLints            | ✓      | ✗                 | later     |
| TodoWrite            | ✓      | ✗                 | later     |
| Task/subagents       | ✓      | ✗                 | later     |
| MCP                  | ✓      | ✗                 | later     |
| Plan/Ask modes       | ✓      | ✗                 | later     |


---

## 15. Связанные файлы для рефакторинга

При переходе на Agent mode затронем:


| Файл                                                  | Изменение                                   |
| ----------------------------------------------------- | ------------------------------------------- |
| `src/shared/systemPrompt.ts`                          | Legacy chat prompt; agent prompt отдельно   |
| `src/main/services/LlmService.ts`                     | + `complete()`, tool messages, trim history |
| `src/renderer/src/store/aiStore.ts`                   | Agent vs Chat send paths                    |
| `src/renderer/src/components/AiPanel/AiPanel.tsx`     | Enable Agent mode                           |
| `src/renderer/src/components/AiPanel/ChatMessage.tsx` | Tool blocks UI                              |
| `src/main/preload.ts`                                 | Agent IPC surface                           |
| `src/main/index.ts`                                   | Register agentHandlers                      |


---

*Этапы 1–6 (базово) завершены. Q1–Q10 утверждены. Далее: UI polish, Plan/Ask modes, P1 tools.*