# Результаты перехвата Cursor → Dirk (2026-10-01)

Источник: `test-capture/logs/` (~38 chat-completions + verify/models).  
Модель в Override: **Dirk**. User-Agent: `Cursor/1.0`.

A1 прогонялся как **Ask** (в Cursor нет отдельного Chat) — корректно.  
A4 (Plan): пользователь **не нажимал Build** — перехвачен research + AskQuestion, **CreatePlan в assistant tool_calls не попал** (следующий ход после ответов на вопросы).

---

## Карта сценариев → файлы

| Сценарий | Режим | Первый request | Промпт |
|----------|-------|----------------|--------|
| A1 | Ask | `20261001T070136_474257` | Привет! Ответь одним предложением. |
| A2 | Ask | `20261001T070214_176512` | Что делает README.md? (+ tool Read) |
| A3 | Agent | `20261001T070250_637751` | Привет, как дела? |
| B1 | Agent | `20261001T070321_732223` | Создай test-capture/hello.txt |
| B3 | Agent | `20261001T070334_314500` | Найди "function" в package.json |
| C1 | Agent | `20261001T070413_806207` | Объясни связь между файлами |
| C2 | Ask | `20261001T070511_133835` → `070654` | Мульти-чат (планеты, что умеешь…) |
| D1 | Agent | `20261001T070711_258910` | 17×23 (thinking) |
| D2 | Agent | `20261001T070755_028841` → `070824` | Рефакторинг auth на 3 шага |
| **A4** | **Plan** | `20261001T071750_440630` → `072148` | Составь план миграции auth на 3 шага без кода |

### A4 Plan — цепочка запросов

| Шаг | Файл | Что происходит |
|-----|------|----------------|
| 1 | `071750_440630` | Первый запрос Plan, 3 messages |
| 2 | `071819` … `072012` | **Subagent Task** (`subagent_type: explore`) — отдельные API-вызовы с другим system + tool **UpdateCurrentStep** |
| 3 | `072122_819639` | После Task → **AskQuestion** (уточнение scope) |
| 4 | `072148_010109` | Ответы на AskQuestion в history; **следующий** ответ модели должен был вызвать **CreatePlan** — не перехвачен |

Build / SwitchMode → Agent **не перехвачены** (ожидаемо).

---

## Таблица «что искать» (заполнено)

| Вопрос | Agent | Ask | Plan |
|--------|-------|-----|------|
| Поле `tools` в JSON? | **Да, 19** | **Да, 18** | **Да, 20** |
| Формат tool call | **OpenAI `tool_calls`** | **OpenAI `tool_calls`** | **OpenAI `tool_calls`** (Task, AskQuestion) |
| Отдельный большой `system`? | **~14.3k** | **~11.6k** | **~14.6k** (+ `<plan_mode_guardrails>`) |
| User message с XML? | **Да** | **Да** | **Да** (+ длинный Plan `system_reminder`) |
| `max_tokens` / `max_completion_tokens`? | **Нет** | **Нет** | **Нет** |
| `temperature`, `top_p`, `top_k`? | **Нет** | **Нет** | **Нет** |
| `stream: true` всегда? | **Да** | **Да** | **Да** |
| Картинки / `image_url`? | Нет | Нет | Нет |
| Thinking | **`reasoning_content`** | **`reasoning_content`** | **`reasoning_content`** |
| Финализация плана | — | — | **`CreatePlan` tool** (не попал в лог) |

---

## Структура JSON-запроса

Ключи тела (всегда одни и те же):

```json
["messages", "model", "stream", "stream_options", "tools", "user"]
```

| Поле | Значение |
|------|----------|
| `model` | `"Dirk"` (имя из Override) |
| `stream` | `true` |
| `stream_options` | `{"include_usage": true}` |
| `user` | `auth0\|user_…` (идентификатор пользователя Cursor) |
| `temperature` / `max_tokens` / `top_p` | **не отправляются** — сервер использует свои дефолты |

---

## Структура `messages`

```
1. role: system     — большой промпт Cursor (agent/ask body)
2. role: user       — «bootstrap»: <user_info>, <agent_skills>, <dynamic_tool_catalog> (Agent)
3. role: user       — каждый ход пользователя (multipart content):
     - <open_and_recently_viewed_files>
     - <system_reminder> Ask/Plan mode is active … </system_reminder>   (Ask / Plan)
     - <timestamp>…</timestamp><user_query>…</user_query>
4. role: assistant  — ответ или tool_calls
5. role: tool       — результат инструмента
   … повтор 3–5
```

### Ask vs Agent vs Plan

| | Ask | Agent | Plan |
|---|-----|-------|------|
| System prompt | ~11624, без dynamic/mode | ~14275, +`<dynamic_tools>` +`<mode_selection>` | ~14632, как Agent + **`<plan_mode_guardrails>`** |
| Tools count | 18 | 19 | **20** |
| Эксклюзивные tools | — | **SwitchMode** | **CreatePlan** (+ SwitchMode) |
| Mode hint в user | `Ask mode is active` | — | **`Plan mode is active`** (+ правила CreatePlan, mermaid_syntax) |
| Типичный flow | Read/Grep → текст | tools → правки | **Task explore** → AskQuestion → **CreatePlan** |

Базовые 18 tools (Ask): Shell, Glob, Grep, AwaitShell, Read, Delete, StrReplace, Write, EditNotebook, TodoWrite, ReadLints, WebSearch, WebFetch, AskQuestion, Task, GetDynamicTools, FetchMcpResource, CallDynamicTool.

- Agent: + **SwitchMode**
- Plan: + **SwitchMode** + **CreatePlan**

#### Plan-only детали

**System** — блок `<plan_mode_guardrails>`:
- в Plan mode править только markdown;
- для кода → `SwitchMode` → agent.

**User `system_reminder`** (Plan) — ключевое:
- запрет edits / non-readonly tools;
- исследовать код → **`CreatePlan`** tool (не текстом);
- вопросы через **AskQuestion**;
- parallel **Task** subagents для research;
- правила **mermaid** в плане.

**CreatePlan** (в `tools`, см. `docs/cursor/tools/plan-tools.json`):
- `name`, `overview`, `plan` (markdown, первая строка `# Title`), `todos[]`.

**Subagent Task** (Plan A4): Cursor шлёт **отдельные** chat-completions на тот же endpoint:
- system: «file search specialist», `You are running as a subagent…`;
- tools: 18 + **UpdateCurrentStep** (не CreatePlan);
- user query = prompt из Task tool;
- пример: `071934_108569` (~200KB JSON, 27 messages).

**Build** (не перехвачен): по system prompt — после подтверждения плана пользователь жмёт Build → ожидаем `SwitchMode(target_mode_id: agent)` и обычный Agent flow.

---

## Tool calls — формат

**Не XML.** Cursor использует нативный OpenAI tools API.

Assistant с tool call:

```json
{
  "role": "assistant",
  "content": [],
  "tool_calls": [{
    "id": "SNgnM7TzR9OqcO1SvnQMXMVsiMdH7IpC",
    "index": 0,
    "type": "function",
    "function": {
      "name": "Read",
      "arguments": "{\"path\":\"d:\\\\Cursor\\\\OpenLLM\\\\README.md\"}"
    }
  }]
}
```

Tool result:

```json
{
  "role": "tool",
  "name": "Read",
  "tool_call_id": "SNgnM7TzR9OqcO1SvnQMXMVsiMdH7IpC",
  "content": [{ "type": "text", "text": "     1|# LocaLLMIDE\n     2|…" }]
}
```

Read возвращает содержимое с префиксами `LINE_NUMBER|` (как в system prompt `<inline_line_numbers>`).

Stream: `delta.tool_calls[]` по частям, затем `finish_reason: "tool_calls"`.

---

## Thinking / reasoning

В stream-ответе llama-server (Qwen3):

- `delta.reasoning_content` — «мысли» модели
- `delta.content` — финальный ответ пользователю
- **Не** `<think>` в content (это UI Cursor после парсинга)

Пример: `20261001T070821_984374_response_stream_unknown.json`.

---

## История (C2 — мульти-Ask)

- Bootstrap `user` (#2) **не дублируется**
- Каждый новый ход = новый `user` block (open files + reminder + query)
- Assistant ответы: `content: [{type:"text", text:"…"}]` (массив, не строка)
- Вся история уходит в одном `messages[]` — **25k+ prompt tokens** к 6-му сообщению

---

## Сравнение с OpenLLM (gap)

| Аспект | Cursor | OpenLLM сейчас |
|--------|--------|----------------|
| Tools в API | `tools` + `tool_calls` | **XML в тексте assistant** |
| `max_tokens` | не шлёт | **всегда шлёт** |
| Sampling | не шлёт | опционально (checkbox) |
| Messages | 3+ слоя, multipart user | system + один user string |
| Mode | `<system_reminder>` в user | частично в system prompt |
| Tool results | `role: tool` | текст в user/assistant |
| Thinking | `reasoning_content` stream | `<think>` parse |
| `stream_options` | `include_usage: true` | нет |

---

## Рекомендации для OpenLLM (приоритет)

Подробный план по фазам: **[cursor-parity-roadmap.md](./cursor-parity-roadmap.md)**

1. **Фаза 1** — payload без обязательного `max_tokens`, `stream_options.include_usage`
2. **Фаза 2** — native tools API (XML → `tool_calls`)
3. **Фаза 3** — структура messages (bootstrap + turns)
4. **Фаза 4** — `reasoning_content`, context ring, Ask/Plan UI

---

## Связанные файлы

- Логи: `test-capture/logs/`
- Скрипт анализа: `test-capture/analyze_logs.py`
- Эталон tools Ask: `docs/cursor/tools/ask-tools.json`
- Эталон tools Agent: `docs/cursor/tools/agent-tools.json`
- Эталон tools Plan: `docs/cursor/tools/plan-tools.json`
- System body Agent: `docs/cursor/cursor_agent.txt`
- Plan A4 первый request: `test-capture/logs/20261001T071750_440630_request__v1_chat_completions.json`
- Plan A4 последний request: `test-capture/logs/20261001T072148_010109_request__v1_chat_completions.json`
