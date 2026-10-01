#!/usr/bin/env python3
"""
Reverse proxy + JSON logger for OpenAI-compatible APIs (llama-server).

Cursor → this proxy (public port) → llama-server (upstream).

Usage on u24r3090 (Ubuntu 24 — PEP 668, не pip в систему):
  sudo apt install -y python3-aiohttp
  # или: python3 -m venv .venv && .venv/bin/pip install aiohttp
  UPSTREAM=http://127.0.0.1:8080 PORT=8081 LOG_DIR=~/cursor-capture/logs \\
    python3 cursor-api-capture.py

Point Cursor Override OpenAI Base URL to: http://192.168.1.236:8081/v1
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from aiohttp import ClientSession, web
except ImportError:
    print("Install: sudo apt install python3-aiohttp  (or venv + pip install aiohttp)", file=sys.stderr)
    raise

UPSTREAM = os.environ.get("UPSTREAM", "http://127.0.0.1:8080").rstrip("/")
LISTEN_HOST = os.environ.get("HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("PORT", "8081"))
LOG_DIR = Path(os.environ.get("LOG_DIR", Path.home() / "cursor-capture" / "logs")).expanduser()

REDACT_HEADERS = {"authorization", "x-api-key", "api-key"}


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%f")


def safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", value)[:80] or "req"


def redact_headers(headers: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in headers.items():
        if key.lower() in REDACT_HEADERS:
            out[key] = "<redacted>"
        else:
            out[key] = value
    return out


def parse_body(raw: bytes) -> Any:
    if not raw:
        return None
    text = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"_raw_preview": text[:100_000]}


def summarize_messages(body: Any) -> dict[str, Any] | None:
    if not isinstance(body, dict):
        return None
    messages = body.get("messages")
    if not isinstance(messages, list):
        return None
    roles: dict[str, int] = {}
    total_chars = 0
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = str(msg.get("role", "?"))
        roles[role] = roles.get(role, 0) + 1
        content = msg.get("content")
        if isinstance(content, str):
            total_chars += len(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    total_chars += len(str(part.get("text", "")))
    return {
        "message_count": len(messages),
        "roles": roles,
        "approx_content_chars": total_chars,
    }


def write_log(record: dict[str, Any]) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    path_part = safe_name(record.get("path", "unknown"))
    fname = f"{record['id']}_{record['phase']}_{path_part}.json"
    path = LOG_DIR / fname
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


async def forward_request(request: web.Request) -> web.StreamResponse:
    req_id = utc_stamp()
    raw_body = await request.read()
    body = parse_body(raw_body)
    path = request.rel_url.path
    query = request.rel_url.query_string

    upstream_url = f"{UPSTREAM}{path}"
    if query:
        upstream_url += f"?{query}"

    req_record: dict[str, Any] = {
        "id": req_id,
        "phase": "request",
        "ts": datetime.now(timezone.utc).isoformat(),
        "method": request.method,
        "path": path,
        "query": query,
        "headers": redact_headers({k: v for k, v in request.headers.items()}),
        "body": body,
        "body_keys": sorted(body.keys()) if isinstance(body, dict) else None,
        "messages_summary": summarize_messages(body),
        "upstream": upstream_url,
    }
    write_log(req_record)

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length", "transfer-encoding")
    }

    async with ClientSession() as session:
        async with session.request(
            request.method,
            upstream_url,
            headers=headers,
            data=raw_body,
            allow_redirects=False,
        ) as upstream:
            resp_headers = {k: v for k, v in upstream.headers.items()}
            content_type = upstream.headers.get("Content-Type", "")
            is_stream = "text/event-stream" in content_type or body and isinstance(body, dict) and body.get("stream")

            if is_stream:
                response = web.StreamResponse(status=upstream.status, headers=resp_headers)
                await response.prepare(request)

                chunks: list[str] = []
                async for chunk in upstream.content.iter_any():
                    if chunk:
                        text = chunk.decode("utf-8", errors="replace")
                        chunks.append(text)
                        await response.write(chunk)

                stream_text = "".join(chunks)
                resp_record = {
                    "id": req_id,
                    "phase": "response_stream",
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "status": upstream.status,
                    "headers": resp_headers,
                    "stream_chars": len(stream_text),
                    "stream_preview": stream_text[:20_000],
                }
                write_log(resp_record)
                await response.write_eof()
                return response

            resp_body = await upstream.read()
            resp_parsed = parse_body(resp_body)
            resp_record = {
                "id": req_id,
                "phase": "response",
                "ts": datetime.now(timezone.utc).isoformat(),
                "status": upstream.status,
                "headers": resp_headers,
                "body": resp_parsed,
            }
            write_log(resp_record)

            return web.Response(
                status=upstream.status,
                headers=resp_headers,
                body=resp_body,
            )


async def health(_request: web.Request) -> web.Response:
    return web.json_response({"status": "capture-proxy-ok", "upstream": UPSTREAM, "log_dir": str(LOG_DIR)})


def main() -> None:
    app = web.Application(client_max_size=512 * 1024 * 1024)
    app.router.add_get("/health", health)
    app.router.add_route("*", "/{path:.*}", forward_request)

    print(f"Capture proxy listening on http://{LISTEN_HOST}:{LISTEN_PORT}")
    print(f"Upstream: {UPSTREAM}")
    print(f"Logs: {LOG_DIR}")
    web.run_app(app, host=LISTEN_HOST, port=LISTEN_PORT)


if __name__ == "__main__":
    main()
