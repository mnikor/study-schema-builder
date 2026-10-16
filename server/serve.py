#!/usr/bin/env python3
"""
Study Schema Builder server for environments without Node.js (e.g. Domino's standard environment).

Python standard library only. Serves the prebuilt app from domino/app/ and provides the same API as
server/api.mjs:
  GET  .../api/health   -> {"ai": bool, "model": str, "keySource": str|null}
  POST .../api/analyze  -> NDJSON stream of {"type": "progress"|"result"|"error", ...}

Paths may carry a proxy prefix (Domino Apps), so routes and files are matched by suffix.
The OpenAI key stays in this process (OPENAI_API_KEY); HTTPS_PROXY is honoured automatically.
"""
import json
import mimetypes
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.environ.get("SSB_DIST") or os.path.join(APP_DIR, "domino", "app"))
MAX_BODY = 60 * 1024 * 1024
TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".map": "application/json", ".wasm": "application/wasm"}

with open(os.path.join(ROOT, "prompt.json"), encoding="utf-8") as f:
    PROMPT = json.load(f)


def read_env_file(path):
    out = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                out[k.replace("export ", "").strip()] = v.strip().strip("'\"")
    except OSError:
        pass
    return out


def load_config():
    """Key lookup: environment, then .env.local in the project folder (same as the Node server)."""
    file_env, source = {}, None
    for p in [os.environ.get("STUDIO_ENV_FILE"), os.path.join(APP_DIR, ".env.local"), os.path.join(APP_DIR, "..", "study-schema", ".env.local")]:
        if p:
            env = read_env_file(p)
            if env.get("OPENAI_API_KEY"):
                file_env, source = env, os.path.relpath(p, APP_DIR)
                break
    key = os.environ.get("OPENAI_API_KEY") or file_env.get("OPENAI_API_KEY", "")
    return {
        "key": key,
        "model": os.environ.get("STUDIO_AI_MODEL") or file_env.get("STUDIO_AI_MODEL") or "gpt-5.4",
        "base": (os.environ.get("OPENAI_BASE_URL") or file_env.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/"),
        "source": "environment" if os.environ.get("OPENAI_API_KEY") else source,
    }


def user_prompt(body):
    """Mirror of userPrompt() in shared/prompt.mjs."""
    hints = []
    st = body.get("studyType")
    if st and st != "auto":
        hints.append('The user says the study type is "%s".' % st)
    if body.get("guidelines"):
        hints.append("The user wants the figures to follow: %s." % ", ".join(body["guidelines"]))
    file_name = (body.get("file") or {}).get("name") or body.get("fileName")
    text = body.get("text")
    parts = [
        "Extract the study design for diagramming.",
        " ".join(hints),
        "Document: %s." % file_name if file_name else "",
        "Note: the document was long, so only the sections most relevant to study design are included below." if body.get("truncated") else "",
        "\n----- DOCUMENT TEXT -----\n%s\n----- END -----" % text if text else "The document is attached.",
    ]
    return "\n".join(p for p in parts if p)


def resolve_file(url_path):
    """Find a built file for a URL path, ignoring any leading proxy prefix."""
    parts = [p for p in unquote(url_path).split("/") if p and p not in (".", "..")]
    for i in range(len(parts)):
        candidate = os.path.abspath(os.path.join(ROOT, *parts[i:]))
        if candidate.startswith(ROOT + os.sep) and os.path.isfile(candidate):
            return candidate
    return None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"  # close-delimited responses make streaming simple
    server_version = "StudySchemaBuilder"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def send_json(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.endswith("/api/health"):
            cfg = load_config()
            return self.send_json(200, {"ai": bool(cfg["key"]), "model": cfg["model"], "keySource": cfg["source"]})
        found = resolve_file(path)
        if not found and os.path.splitext(path)[1]:
            return self.send_json(404, {"error": "Not found"})
        file = found or os.path.join(ROOT, "index.html")
        ext = os.path.splitext(file)[1].lower()
        ctype = TYPES.get(ext) or mimetypes.guess_type(file)[0] or "application/octet-stream"
        with open(file, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urlsplit(self.path).path
        if not path.endswith("/api/analyze"):
            return self.send_json(404, {"error": "Not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send_json(413, {"error": "Upload too large (limit 60 MB)."})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        cfg = load_config()
        if not cfg["key"]:
            return self.send_json(503, {"error": "No OpenAI key configured. Set OPENAI_API_KEY."})
        if not body.get("text") and not body.get("file"):
            return self.send_json(400, {"error": "Provide document text or a file."})
        self.analyze(body, cfg)

    def analyze(self, body, cfg):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        lock = threading.Lock()
        started = time.time()
        done = threading.Event()

        def send(obj):
            with lock:
                try:
                    self.wfile.write((json.dumps(obj) + "\n").encode())
                    self.wfile.flush()
                except OSError:
                    done.set()

        def heartbeat():
            while not done.wait(4):
                send({"type": "progress", "stage": "thinking", "elapsed": round(time.time() - started)})

        threading.Thread(target=heartbeat, daemon=True).start()
        content = []
        f = body.get("file") or {}
        if f.get("data"):
            content.append({"type": "input_file", "filename": f.get("name") or "document.pdf", "file_data": "data:%s;base64,%s" % (f.get("mime") or "application/pdf", f["data"])})
        content.append({"type": "input_text", "text": user_prompt(body)})
        payload = {
            "model": cfg["model"],
            "input": [
                {"role": "developer", "content": [{"type": "input_text", "text": PROMPT["systemPrompt"]}]},
                {"role": "user", "content": content},
            ],
            "text": {"format": {"type": "json_schema", "name": "study_model", "strict": True, "schema": PROMPT["schema"]}},
            "reasoning": {"effort": "medium" if body.get("depth") == "thorough" else "low"},
            "max_output_tokens": 32000,
            "store": False,
            "stream": True,
        }
        send({"type": "progress", "stage": "sending", "elapsed": 0, "model": cfg["model"]})
        req = urllib.request.Request(
            cfg["base"] + "/responses",
            data=json.dumps(payload).encode(),
            headers={"Authorization": "Bearer " + cfg["key"], "Content-Type": "application/json"},
            method="POST",
        )
        out, final, last = [], None, 0
        try:
            with urllib.request.urlopen(req, timeout=900) as resp:
                for raw in resp:
                    line = raw.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        ev = json.loads(data)
                    except ValueError:
                        continue
                    t = ev.get("type")
                    if t == "response.output_text.delta":
                        out.append(ev.get("delta", ""))
                        n = sum(len(x) for x in out)
                        if n - last > 800:
                            last = n
                            send({"type": "progress", "stage": "writing", "chars": n, "elapsed": round(time.time() - started)})
                    elif t == "response.completed":
                        final = ev.get("response")
                    elif t == "response.incomplete":
                        reason = ((ev.get("response") or {}).get("incomplete_details") or {}).get("reason", "incomplete")
                        send({"type": "error", "message": "The model stopped early (%s). Try “Fast” depth or a shorter document." % reason})
                        return
                    elif t in ("response.failed", "error"):
                        msg = ((ev.get("response") or {}).get("error") or {}).get("message") or ev.get("message") or "The model request failed."
                        send({"type": "error", "message": msg})
                        return
                    elif t == "response.refusal.delta":
                        send({"type": "error", "message": "The model declined to process this document."})
                        return
            try:
                model = json.loads("".join(out))
            except ValueError:
                send({"type": "error", "message": "The model returned text that is not valid JSON."})
                return
            send({"type": "result", "model": model, "aiModel": cfg["model"], "usage": (final or {}).get("usage"), "elapsed": round(time.time() - started)})
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")
            try:
                detail = json.loads(detail).get("error", {}).get("message") or detail
            except ValueError:
                pass
            send({"type": "error", "message": "OpenAI error %s: %s" % (e.code, detail[:300])})
        except (urllib.error.URLError, OSError) as e:
            send({"type": "error", "message": "Could not reach %s (%s). Check network access or set OPENAI_BASE_URL / HTTPS_PROXY." % (cfg["base"], getattr(e, "reason", e))})
        finally:
            done.set()


def main():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5181"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    print("Study Schema Builder (Python) on http://%s:%d  serving %s" % (host, port, ROOT), flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
