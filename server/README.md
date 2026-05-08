# server

Flask backend for Claude Decoded.

## Setup

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Server runs on `http://localhost:5001`. The Vite dev server proxies `/api/*` to it.

## Endpoints

- `GET  /api/health` — liveness check
- `POST /api/insights` — multipart form: `api_key` (string) + `files` (one or more `.jsonl` Claude Code transcripts). Returns `{ summary, patterns, motivations, sessions_analyzed, messages_analyzed }`.


Redis Queue