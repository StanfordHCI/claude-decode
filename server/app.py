import asyncio
import json
import os
from latticing import Lattice, AsyncLLM, SyncLLM, Sequential, SessionLayer
from typing import List, Dict
from datetime import datetime

from celery import Celery
from celery.result import AsyncResult
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery = Celery(
    "insights",
    broker=REDIS_URL,
    backend=REDIS_URL,
)
celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Allow large folder uploads (Claude Code logs can be many MBs)
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200 MB

ANALYSIS_MODEL = "claude-sonnet-4-6"


def extract_user_text(entry):
    """Pull the user-authored text out of a Claude Code transcript entry."""
    if entry.get("type") != "user":
        return None
    message = entry.get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                parts.append(c.get("text", ""))
        return "\n".join(p for p in parts if p)
    return None


def _parse_iso_or_epoch(value):
    """Accept Claude Code's ISO timestamps or unix epoch numbers; return epoch float."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


def _content_to_text(content):
    """Claude Code message content can be a string or a list of typed blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                parts.append(c.get("text", ""))
        return "\n".join(p for p in parts if p)
    return ""


def process_claude_code_data(name: str = "User", entries: List[List[Dict]] = None, times: List[float] = None, min_length: int = 10):
    interaction_traces = []
    print("Number of entries:", len(entries))
    for session_time, session in zip(times or [], entries or []):
        session_trace = []
        for message in session:
            if "message" not in message:
                continue
            msg = message["message"]
            ts_epoch = _parse_iso_or_epoch(message.get("timestamp"))
            fmt_time = (
                datetime.fromtimestamp(ts_epoch).strftime("%Y-%m-%d %H:%M:%S")
                if ts_epoch is not None
                else ""
            )
            content_text = _content_to_text(msg.get("content"))
            if not content_text:
                continue
            speaker = name if msg.get("role") == "user" else "Claude Code"
            session_trace.append({
                "interaction": f"{speaker}: {content_text}",
                "metadata": {"time": fmt_time},
            })
        if len(session_trace) > min_length:
            interaction_traces.append({
                "interactions": session_trace,
                "time": datetime.fromtimestamp(session_time).strftime("%Y-%m-%d %H:%M:%S"),
            })
        else:
            print(f"Skipping session with {len(session_trace)} messages (less than {min_length})")
    return interaction_traces


def parse_transcripts(files, name: str = "User"):
    """Parse uploaded transcript files into both:
    - flat_entries: list of all parsed message dicts (used by extract_user_text downstream)
    - processed: lattice-style interaction traces (one entry per session/file)
    """
    sessions = []
    times = []
    flat_entries = []

    for f in files:
        try:
            raw = f.read().decode("utf-8", errors="ignore")
        except Exception:
            continue

        session_messages = []
        latest_ts = None
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            session_messages.append(msg)
            flat_entries.append(msg)
            ts = _parse_iso_or_epoch(msg.get("timestamp"))
            if ts is not None and (latest_ts is None or ts > latest_ts):
                latest_ts = ts

        if session_messages:
            sessions.append(session_messages)
            times.append(latest_ts if latest_ts is not None else datetime.now().timestamp())

    processed = process_claude_code_data(name=name, entries=sessions, times=times)
    return processed, flat_entries


@celery.task(bind=True, name="insights.build_lattice")
def build_insights_task(self, name: str, api_key: str, interaction_traces: list):
    async def _run():
        config = Sequential(
            SessionLayer(n=5),
            SessionLayer(n=10),
            SessionLayer(n=20),
            SessionLayer(n=40),
        )
        l = Lattice(
            name=name,
            interactions=interaction_traces,
            config=config,
            insight_model=AsyncLLM(name="claude-opus-4-6", api_key=api_key),
            observer_model=AsyncLLM(name="claude-sonnet-4-6", api_key=api_key),
            evidence_model=AsyncLLM(name="claude-sonnet-4-6", api_key=api_key),
            format_model=SyncLLM(name="claude-sonnet-4-6", api_key=api_key),
            params={"max_concurrent": 100, "min_insights": 3, "window_size": 100},
            description="the user's conversation with Claude Code, an AI-based coding agent",
        )
        await l.build()
        lattice = l.lattice
        layers = lattice["nodes"].keys()
        last_key = list(layers)[-1]
        top_layer = lattice["nodes"][last_key]
        return {"status": "ok", "lattice": lattice, "top_layer": top_layer}

    return asyncio.run(_run())


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/insights", methods=["POST"])
def enqueue_insights():
    name = request.form.get("name", "User").strip()
    api_key = request.form.get("api_key", "").strip()
    files = request.files.getlist("files")

    if not api_key:
        return jsonify({"error": "Anthropic API key is required."}), 400
    if not files:
        return jsonify({"error": "No log files were uploaded."}), 400

    interaction_traces, flat_entries = parse_transcripts(files, name)
    if not flat_entries:
        return jsonify({"error": "Could not parse any transcript entries from the uploaded files."}), 400

    async_result = build_insights_task.delay(name, api_key, interaction_traces)
    return jsonify({"task_id": async_result.id, "state": "QUEUED"})


@app.route("/api/insights/task/<task_id>", methods=["GET"])
def insights_task_status(task_id):
    result = AsyncResult(task_id, app=celery)
    if result.state == "PENDING":
        return jsonify({"state": "PENDING", "message": "Task is waiting in the queue."})
    if result.state in ("STARTED", "RETRY"):
        return jsonify({"state": result.state})
    if result.state == "SUCCESS":
        payload = result.result or {}
        return jsonify({"state": "SUCCESS", **payload})
    if result.state == "FAILURE":
        err = str(result.info) if result.info else "Unknown error"
        return jsonify({"state": "FAILURE", "error": err})
    return jsonify({"state": result.state})


# @app.route("/api/insights", methods=["POST"])
# def insights():
#     name = request.form.get("name", "User").strip()
#     api_key = request.form.get("api_key", "").strip()
#     files = request.files.getlist("files")

#     if not api_key:
#         return jsonify({"error": "Anthropic API key is required."}), 400
#     if not files:
#         return jsonify({"error": "No log files were uploaded."}), 400

#     interaction_traces, entries = parse_transcripts(files, name)
#     if not entries:
#         return jsonify({"error": "Could not parse any transcript entries from the uploaded files."}), 400

#     user_messages = []
#     for e in entries:
#         text = extract_user_text(e)
#         if text and text.strip():
#             user_messages.append(text.strip())

#     session_ids = {e.get("sessionId") for e in entries if e.get("sessionId")}

#     if not user_messages:
#         return jsonify({
#             "summary": "No user-authored messages were found in the uploaded transcripts.",
#             "patterns": [],
#             "motivations": [],
#             "sessions_analyzed": len(session_ids),
#             "messages_analyzed": 0,
#         })

#     # Cap so we stay within reasonable token budgets
#     sample = user_messages[:120]
#     joined = "\n---\n".join(m[:1500] for m in sample)

#     prompt = f"""You are analyzing a user's Claude Code sessions to understand the patterns and motivations behind how they work.

# Below are user-authored messages from their sessions, separated by ---.

# {joined}

# Return a single JSON object with these keys:
# - "summary": 2-3 sentences describing who this user appears to be and what they spend their Claude Code time on.
# - "patterns": an array of 4-6 short observations (1 sentence each) about how they work — recurring habits, what they reach for, what they avoid.
# - "motivations": an array of 3-4 inferred motivations (1 sentence each) — what they're optimizing for, what they protect against, what they care about.

# Be specific to this user. Avoid generic advice. Return ONLY valid JSON, no prose, no code fences."""

#     try:
#         client = Anthropic(api_key=api_key)
#         response = client.messages.create(
#             model=ANALYSIS_MODEL,
#             max_tokens=2000,
#             messages=[{"role": "user", "content": prompt}],
#         )
#     except AnthropicError as e:
#         return jsonify({"error": f"Anthropic API error: {e}"}), 502
#     except Exception as e:
#         return jsonify({"error": f"Unexpected error calling Anthropic: {e}"}), 500

#     text = ""
#     for block in response.content:
#         if getattr(block, "type", None) == "text":
#             text += block.text
#     text = text.strip()

#     # Strip code fences if the model wrapped its response
#     if text.startswith("```"):
#         text = text.strip("`")
#         if text.lower().startswith("json"):
#             text = text[4:]
#         text = text.strip()

#     try:
#         result = json.loads(text)
#     except json.JSONDecodeError:
#         result = {
#             "summary": text or "The model did not return parseable JSON.",
#             "patterns": [],
#             "motivations": [],
#         }

#     result["sessions_analyzed"] = len(session_ids)
#     result["messages_analyzed"] = len(user_messages)
#     return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
