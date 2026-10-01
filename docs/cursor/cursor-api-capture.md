# Перехват запросов Cursor → локальная модель (u24r3090)

Цель: понять **что именно Cursor отправляет** в OpenAI-compatible API (поля JSON, структура `messages`, tools, thinking, контекст) и сравнить с тем, что шлёт OpenLLM.

Схема (через HTTPS-шлюз u24http):

```
Cursor  →  https://openfunai.duckdns.org/dirk-capture/v1
              ↓ Caddy (u24http :443)
           192.168.1.236:8081  cursor-api-capture.py  →  llama-server :8080
                              ↓
                    ~/cursor-capture/logs/*.json
```

Прямой `http://192.168.1.236:8081` не нужен — Cursor требует HTTPS, используем шлюз из [u24http.md](../llms/u24http.md).

---

## TODO — чеклист

### На сервере u24r3090 (192.168.1.236)

- [ ] **1.** Убедиться что `dirk` работает на `:8080` (`curl http://127.0.0.1:8080/health`)
- [ ] **2.** Скопировать скрипт на сервер:
  ```bash
  mkdir -p ~/cursor-capture
  # с Windows (PowerShell) или scp:
  # scp scripts/cursor-api-capture.py openfun@192.168.1.236:~/cursor-capture/
  ```
- [ ] **3.** Установить зависимость (один раз). На Ubuntu 24 **не** `pip3 install` в систему (PEP 668):
  ```bash
  # вариант A — через apt (рекомендуется)
  sudo apt install -y python3-aiohttp

  # вариант B — venv, если apt-пакета нет
  cd ~/cursor-capture
  python3 -m venv .venv
  .venv/bin/pip install aiohttp
  # дальше запускать: .venv/bin/python cursor-api-capture.py
  ```
- [ ] **4.** UFW на **236**: порт **8081** только для u24http (154), не открывать наружу:
  ```bash
  sudo ufw allow from 192.168.1.154 to any port 8081 proto tcp comment 'cursor capture via u24http'
  ```
- [ ] **5.** Запустить прокси-логгер (dirk на 8080 не трогаем):
  ```bash
  cd ~/cursor-capture
  UPSTREAM=http://127.0.0.1:8080 \
  PORT=8081 \
  LOG_DIR=~/cursor-capture/logs \
  python3 cursor-api-capture.py
  # если ставили через venv (вариант B):
  # UPSTREAM=... PORT=... LOG_DIR=... .venv/bin/python cursor-api-capture.py
  ```
  Или через systemd (см. ниже) — удобнее для длинной сессии.
- [ ] **6.** Проверка на **236** (локально):
  ```bash
  curl http://127.0.0.1:8081/health
  curl http://127.0.0.1:8081/v1/models -H "Authorization: Bearer $(cat /etc/llama/api.key)"
  ```

### На u24http (192.168.1.154)

- [ ] **6b.** Добавить в `/etc/caddy/Caddyfile` блок `handle /dirk-capture/*` (см. [u24http.md](../llms/u24http.md))
- [ ] **6c.** Перезагрузить Caddy:
  ```bash
  sudo caddy validate --config /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  ```
- [ ] **6d.** Проверка через HTTPS (с любой машины):
  ```bash
  curl -s https://openfunai.duckdns.org/dirk-capture/health
  curl -s https://openfunai.duckdns.org/dirk-capture/v1/models \
    -H "Authorization: Bearer $(cat /etc/llama/api.key)"
  ```
  Ожидание: `capture-proxy-ok` и список моделей; в `~/cursor-capture/logs/` на 236 — JSON-файлы.

### В Cursor (Windows)

- [ ] **7.** Settings → Models → **Override OpenAI Base URL**:
  ```
  https://openfunai.duckdns.org/dirk-capture/v1
  ```
- [ ] **8.** OpenAI API Key — тот же ключ, что в `/etc/llama/api.key`
- [ ] **9.** Добавить модель (имя как в Cursor, в запросе уйдёт в поле `model`)
- [ ] **10.** Verify — должен пройти через прокси (в `logs/` появится JSON)
- [ ] **11.** Прогнать **тестовые промпты** ниже (по одному, с паузой)
- [ ] **12.** После каждого сценария — записать в заметку: режим (Agent/Ask/Chat), что делал

### Сбор результатов для анализа

- [ ] **13.** Остановить прокси (Ctrl+C или `systemctl stop cursor-capture`)
- [ ] **14.** Упаковать логи:
  ```bash
  cd ~/cursor-capture
  tar czf cursor-capture-$(date +%Y%m%d).tar.gz logs/
  ```
- [ ] **15.** Скопировать архив на Windows / в репозиторий `docs/cursor/captures/`
- [ ] **16.** Вернуть Cursor Base URL на облако (если нужно) — не забыть!
- [ ] **17.** Отдать архив ассистенту + краткая таблица «сценарий → id файла в logs»

---

## systemd (опционально)

```bash
sudo nano /etc/systemd/system/cursor-capture.service
```

```ini
[Unit]
Description=Cursor API capture proxy
After=network-online.target dirk.service
Wants=network-online.target

[Service]
Type=simple
User=openfun
Group=openfun
WorkingDirectory=/home/openfun/cursor-capture
Environment=UPSTREAM=http://127.0.0.1:8080
Environment=PORT=8081
Environment=LOG_DIR=/home/openfun/cursor-capture/logs
# apt: /usr/bin/python3  |  venv: /home/openfun/cursor-capture/.venv/bin/python
ExecStart=/usr/bin/python3 /home/openfun/cursor-capture/cursor-api-capture.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cursor-capture
journalctl -u cursor-capture -f
```

---

## Что пишет логгер

На каждый HTTP-запрос — файл `*_request_*.json`:

| Поле | Смысл |
|------|--------|
| `body_keys` | Все ключи JSON (temperature, max_tokens, tools, stream, …) |
| `body.messages` | Полная история + system + user (главное!) |
| `messages_summary` | Число сообщений, роли, ~размер текста |
| `headers` | Заголовки (Authorization / x-api-key **заменены** на `<redacted>`) |

На ответ — `*_response_*.json` или `*_response_stream_*.json` (stream preview до 20k символов).

**Не коммить** логи с реальным кодом/секретами — только в приватный архив или вырезки.

---

## Тестовые промпты для Cursor

Прогонять **по порядку**, новый чат на каждый сценарий (чистая история).  
В Agent включи workspace с простым репо (можно OpenLLM или пустой тестовый каталог).

### A. Базовая проверка API

> В Cursor нет отдельного **Chat** — только **Ask**, **Plan**, **Agent**. A1 = Ask.

| # | Режим | Промпт | Зачем |
|---|--------|--------|--------|
| A1 | **Ask** | `Привет! Ответь одним предложением.` | Минимальный запрос: system, messages, tools даже без вызова |
| A2 | **Ask** | `Что делает файл README.md в этом проекте?` | Read-only + tool Read в history |
| A3 | **Agent** | `Привет, как дела?` | Agent system (+SwitchMode), thinking |
| A4 | **Plan** | `Составь план миграции auth на 3 шага без кода` | `Plan mode is active` в system_reminder |

### B. Tool calls / файлы

| # | Режим | Промпт | Зачем |
|---|--------|--------|--------|
| B1 | **Agent** | `Создай файл test-capture/hello.txt с текстом Hello` | Write tool: формат tool_calls vs XML |
| B2 | **Agent** | `Прочитай test-capture/hello.txt и скажи первую строку` | Read tool + результат в history |
| B3 | **Agent** | `Найди все упоминания "function" в package.json` | Grep/search |

### C. Контекст и длинная история

| # | Режим | Промпт | Зачем |
|---|--------|--------|--------|
| C1 | **Agent** | Открыть 2–3 файла в редакторе, затем: `Объясни связь между этими файлами` | @files / open files в messages? |
| C2 | **Ask** | 5–6 коротких сообщений подряд в **одном** чате, потом: `О чём мы говорили в начале?` | Сколько history уходит, обрезка |

### D. Thinking / reasoning

| # | Режим | Промпт | Зачем |
|---|--------|--------|--------|
| D1 | **Agent** | `Подумай вслух и ответь: сколько будет 17×23?` | thinking tags, reasoning_content, chat_template_kwargs |
| D2 | **Agent** | Сложная задача: `Спланируй рефакторинг модуля auth на 3 шага без кода` | Длинный reasoning |

### E. Параметры генерации

| # | Действие | Зачем |
|---|----------|--------|
| E1 | После A1 открыть `*_request_*.json` | Есть ли `temperature`, `max_tokens`, `top_p`, `stream`? |
| E2 | Сравнить Agent vs Ask на одном промпте «Привет» | Разные ли параметры и system prompt |

---

## Что искать в логах (для отчёта ассистенту)

Заполни таблицу после прогона:

| Вопрос | Agent | Ask | Plan |
|--------|-------|-----|------|
| Поле `tools` / `functions` в JSON? | | | |
| Формат tool call (OpenAI `tool_calls` vs текст/XML)? | | | |
| Отдельный огромный `system` message? | | | |
| User message с XML (`<user_query>`, `<attached_files>`)? | | | |
| `max_tokens` / `max_completion_tokens`? | | | |
| `temperature`, `top_p`, `top_k` отправляет Cursor? | | | |
| `stream: true` всегда? | | | |
| Картинки / `image_url` в messages? | | | |
| `chat_template_kwargs` / `reasoning_effort`? | | | |

---

## Альтернатива: встроенный лог llama-server

Если прокси не нужен, в `dirk.service` можно добавить (проверь что твоя сборка llama.cpp поддерживает):

```
--log-prompts --log-dir /home/openfun/cursor-capture/prompts
```

Минус: только промпты после шаблона, без сырого JSON от Cursor. **Прокси предпочтительнее** для полного перехвата.

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| [scripts/cursor-api-capture.py](../../scripts/cursor-api-capture.py) | Прокси + JSON logger |
| [docs/llms/u24r3090.md](../llms/u24r3090.md) | Сервер Dirk |
| [docs/cursor/cursor_agent.txt](./cursor_agent.txt) | Эталон system prompt Agent |
| [docs/handoff.md](../handoff.md) | OpenLLM agent architecture |

---

## После сбора

Пришли:

1. `cursor-capture-YYYYMMDD.tar.gz` или папку `test-capture/logs/`
2. Таблицу «что искать» (заполненную)
3. Версию Cursor и какую модель указал в Override

**Результаты первого прогона (2026-10-01):** [capture-findings.md](./capture-findings.md)
