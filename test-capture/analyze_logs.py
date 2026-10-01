#!/usr/bin/env python3
import json, glob, re
from pathlib import Path

LOGS = Path(__file__).parent / "logs"

def extract_query(msgs):
    for m in reversed(msgs):
        if m.get("role") != "user":
            continue
        c = m.get("content", "")
        parts = []
        if isinstance(c, str):
            parts = [c]
        elif isinstance(c, list):
            parts = [p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text"]
        for text in parts:
            m2 = re.search(r"<user_query>\s*(.*?)\s*</user_query>", text, re.S)
            if m2:
                return m2.group(1).strip()
    return "?"

def mode_hint(msgs, sys_text):
    for m in reversed(msgs):
        c = m.get("content", "")
        parts = [c] if isinstance(c, str) else [p.get("text", "") for p in c if isinstance(p, dict)]
        for text in parts:
            if "Ask mode is active" in text:
                return "Ask"
            if "Plan mode is active" in text:
                return "Plan"
            if "Agent mode" in text or "You MUST NOT make any edits" not in text and "Ask mode" not in text:
                pass
    if "<mode_selection>" in sys_text:
        return "Agent"
    return "Ask-ish"

def tool_names(body):
    return [t.get("function", {}).get("name") for t in body.get("tools") or []]

def first_requests():
    seen = set()
    rows = []
    for p in sorted(LOGS.glob("*_request__v1_chat_completions.json")):
        d = json.load(open(p, encoding="utf-8"))
        body = d["body"]
        msgs = body["messages"]
        q = extract_query(msgs)
        sys_text = next((m["content"] for m in msgs if m["role"] == "system"), "")
        mode = mode_hint(msgs, sys_text)
        key = (mode, q[:80])
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "file": p.name[:26],
            "mode": mode,
            "query": q[:120],
            "sys_len": len(sys_text),
            "tools": len(body.get("tools") or []),
            "tool_names": tool_names(body),
            "keys": sorted(body.keys()),
            "msgs": len(msgs),
            "stream_options": body.get("stream_options"),
            "user_field": body.get("user"),
        })
    return rows

def assistant_tool_format():
    for p in sorted(LOGS.glob("*_request__v1_chat_completions.json")):
        d = json.load(open(p, encoding="utf-8"))
        for m in d["body"]["messages"]:
            if m.get("role") == "assistant" and m.get("tool_calls"):
                return p.name, m["tool_calls"][0]
            if m.get("role") == "assistant" and isinstance(m.get("content"), str) and "tool" in m.get("content", "").lower()[:200]:
                return p.name, {"content_preview": m["content"][:300]}
    return None, None

if __name__ == "__main__":
    print("=== FIRST REQUEST PER SCENARIO ===")
    for r in first_requests():
        print(f"{r['file']} | {r['mode']} | tools={r['tools']} | sys={r['sys_len']}")
        print(f"  query: {r['query']}")
        print(f"  keys: {r['keys']}")
        print(f"  stream_options: {r['stream_options']}")
        print(f"  user: {r['user_field']}")
        extra = set(r["tool_names"]) - {"Shell","Glob","Grep","Read","Delete","StrReplace","Write","TodoWrite","Task","ReadLints","AskQuestion","SwitchMode","GenerateImage","GetDynamicTools","CallDynamicTool","FetchMcpResource","Await"}
        if extra:
            print(f"  extra tools: {sorted(extra)}")
        print()

    print("=== ASSISTANT TOOL CALL SAMPLE ===")
    fn, sample = assistant_tool_format()
    print(fn)
    print(json.dumps(sample, ensure_ascii=False, indent=2)[:800])

    print("\n=== TOOL MESSAGE SAMPLE ===")
    for p in sorted(LOGS.glob("*_request__v1_chat_completions.json")):
        d = json.load(open(p, encoding="utf-8"))
        for m in d["body"]["messages"]:
            if m.get("role") == "tool":
                print(p.name[:26], json.dumps(m, ensure_ascii=False)[:500])
                raise SystemExit
