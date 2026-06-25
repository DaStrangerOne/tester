"""
AXIOM backend — exec service for the static AXIOM UI.

The static UI (/app/new-app/index.html) only needs two endpoints:
  GET  /api/ping                       → 200 OK health probe
  POST /api/exec  body {cmd, language, timeout}  → {stdout, stderr, exitCode}

Design assumptions (per operator request):
  • Operators reaching this endpoint have already been vetted by the platform.
  • NO command filtering / no allow-list / no rejection. Every command the AI
    plans (nmap, host, dig, whois, nc, curl, jq, traceroute, python3, node,
    bash, etc.) is forwarded verbatim to the shell. Highest privilege within
    the container's kernel-imposed bounds is assumed and exercised.
  • Container is unprivileged (no NET_RAW, no NET_ADMIN); the kernel will reject
    raw sockets regardless of any userspace policy. Stderr is captured and
    returned verbatim so the UI can interpret it.
"""
from __future__ import annotations

import argparse
import asyncio
import fcntl
import json
import os
import pty
import select
import struct
import termios
import shutil
import tempfile
from typing import Any, Dict, List, Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

AXIOM_BACKEND_TOKEN = os.environ.get("AXIOM_BACKEND_TOKEN", "").strip()

app = FastAPI(title="AXIOM Exec Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

LANG_RUNNERS: Dict[str, Dict[str, str]] = {
    "shell":      {"interp": "/bin/bash", "ext": ".sh",  "version": "bash 5.x"},
    "bash":       {"interp": "/bin/bash", "ext": ".sh",  "version": "bash 5.x"},
    "sh":         {"interp": "/bin/bash", "ext": ".sh",  "version": "bash 5.x"},
    "python":     {"interp": "python3",   "ext": ".py",  "version": "python 3.11"},
    "python3":    {"interp": "python3",   "ext": ".py",  "version": "python 3.11"},
    "py":         {"interp": "python3",   "ext": ".py",  "version": "python 3.11"},
    "javascript": {"interp": "node",      "ext": ".js",  "version": "node 20"},
    "js":         {"interp": "node",      "ext": ".js",  "version": "node 20"},
    "node":       {"interp": "node",      "ext": ".js",  "version": "node 20"},
}


def _check_auth(authorization: Optional[str], token: Optional[str] = None) -> None:
    """Optional bearer-token check. Only enforced when AXIOM_BACKEND_TOKEN is set."""
    if not AXIOM_BACKEND_TOKEN:
        return
    value = None
    if authorization and authorization.lower().startswith("bearer "):
        value = authorization.split(None, 1)[1].strip()
    elif token:
        value = token.strip()
    if not value:
        raise HTTPException(status_code=401, detail="Bearer token required")
    if value != AXIOM_BACKEND_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid bearer token")


# ────────────────────────────────────────────────────────────────────────────
# Health
# ────────────────────────────────────────────────────────────────────────────


@app.get("/api/ping")
async def ping_api() -> Dict[str, Any]:
    return _ping_payload()


@app.get("/ping")
async def ping_bare() -> Dict[str, Any]:
    # Mirror of /api/ping so an operator can configure the backend URL either
    # WITH or WITHOUT the trailing /api segment and "TEST CONNECTION" still works.
    return _ping_payload()


def _ping_payload() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "axiom-exec",
        "auth_required": bool(AXIOM_BACKEND_TOKEN),
        "tools": {
            name: bool(shutil.which(name))
            for name in (
                "bash", "python3", "node", "curl", "jq", "nmap", "host",
                "dig", "whois", "nc", "traceroute", "ping",
            )
        },
    }


@app.get("/api/health")
async def health_alias() -> Dict[str, Any]:
    return _ping_payload()


# ────────────────────────────────────────────────────────────────────────────
# Exec
# ────────────────────────────────────────────────────────────────────────────


class ExecRequest(BaseModel):
    cmd: Optional[str] = None
    code: Optional[str] = None              # alias accepted from older callers
    language: Optional[str] = "shell"
    timeout: Optional[int] = 15
    stdin: Optional[str] = ""
    args: Optional[List[str]] = None


async def _run(req: ExecRequest) -> Dict[str, Any]:
    payload = (req.cmd if req.cmd is not None else req.code) or ""
    lang_raw = (req.language or "shell").lower().strip()
    runner = LANG_RUNNERS.get(lang_raw)
    if not runner:
        for key in LANG_RUNNERS:
            if key in lang_raw or lang_raw in key:
                runner = LANG_RUNNERS[key]
                break
    if not runner:
        runner = LANG_RUNNERS["shell"]

    timeout_s = max(1, min(int(req.timeout or 15), 300))

    with tempfile.TemporaryDirectory(prefix="axiom-exec-") as workdir:
        script_path = os.path.join(workdir, f"main{runner['ext']}")
        with open(script_path, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.chmod(script_path, 0o755)

        env = os.environ.copy()
        env["PATH"] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
        env["LANG"] = "C.UTF-8"
        env["TERM"] = "xterm-256color"
        # Tell scripts we're operating as an authorized red-team operator.
        env["AXIOM_ROLE"] = "operator"
        env["AXIOM_CLEARANCE"] = "maximum"

        cmd = [runner["interp"], script_path, *(req.args or [])]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                cwd=workdir,
            )
        except FileNotFoundError as e:
            return {
                "stdout": "",
                "stderr": f"Interpreter missing: {e}",
                "exitCode": 127,
                "language": runner["interp"],
                "version": runner["version"],
                "runtime": "local",
            }

        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(input=(req.stdin or "").encode("utf-8")),
                timeout=timeout_s,
            )
        except asyncio.TimeoutError:
            proc.kill()
            try:
                await proc.wait()
            except Exception:  # noqa: BLE001
                pass
            return {
                "stdout": "",
                "stderr": f"[TIMEOUT] Execution exceeded {timeout_s}s",
                "exitCode": 124,
                "language": runner["interp"],
                "version": runner["version"],
                "runtime": "local",
            }

    return {
        "stdout": stdout_b.decode("utf-8", errors="replace"),
        "stderr": stderr_b.decode("utf-8", errors="replace"),
        "exitCode": proc.returncode if proc.returncode is not None else -1,
        "language": runner["interp"],
        "version": runner["version"],
        "runtime": "local",
    }


@app.post("/api/exec")
async def exec_api(req: ExecRequest, authorization: Optional[str] = Header(default=None)):
    _check_auth(authorization)
    return await _run(req)


@app.post("/exec")
async def exec_bare(req: ExecRequest, authorization: Optional[str] = Header(default=None)):
    _check_auth(authorization)
    return await _run(req)


# Backwards-compat alias used by the previous code-exec wiring.
@app.post("/api/code-exec")
async def exec_legacy(req: ExecRequest, authorization: Optional[str] = Header(default=None)):
    _check_auth(authorization)
    result = await _run(req)
    # Older callers expect `output` + `success`
    parts: List[str] = []
    if result["stdout"]:
        parts.append(result["stdout"].rstrip())
    if result["stderr"] and (result["exitCode"] != 0 or not result["stdout"]):
        parts.append(f"[STDERR]\n{result['stderr'].rstrip()}")
    if result["exitCode"] != 0:
        parts.append(f"\n[EXIT] Code: {result['exitCode']}")
    result["output"] = "\n".join(parts) or "(no output)"
    result["success"] = result["exitCode"] == 0
    return result


@app.get("/api/")
async def root() -> Dict[str, Any]:
    return {
        "name": "AXIOM Exec Service",
        "endpoints": ["/api/ping", "/api/exec", "/api/code-exec", "/api/health"],
        "ui": "static — /app/new-app/index.html",
    }


async def _send_pty_output(ws: WebSocket, master_fd: int) -> None:
    loop = asyncio.get_running_loop()
    while True:
        try:
            await loop.run_in_executor(None, lambda: select.select([master_fd], [], [], None))
            data = os.read(master_fd, 4096)
        except OSError:
            break
        if not data:
            break
        try:
            await ws.send_text(json.dumps({"type": "output", "data": data.decode("utf-8", errors="replace")}))
        except Exception:
            break


@app.websocket("/ws/terminal")
async def websocket_terminal(ws: WebSocket):
    token = ws.query_params.get("token")
    await ws.accept()
    _check_auth(ws.headers.get("authorization"), token)

    master_fd, slave_fd = pty.openpty()
    winsz = struct.pack("HHHH", 24, 80, 0, 0)
    try:
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsz)
    except OSError:
        pass
    os.set_blocking(master_fd, False)

    env = os.environ.copy()
    env["PATH"] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    env["LANG"] = "C.UTF-8"
    env["TERM"] = "xterm-256color"
    env["AXIOM_ROLE"] = "operator"
    env["AXIOM_CLEARANCE"] = "maximum"

    proc = await asyncio.create_subprocess_exec(
        "/bin/bash",
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        env=env,
        cwd=os.getcwd(),
    )
    os.close(slave_fd)

    async def ws_reader() -> None:
        while True:
            msg = await ws.receive_text()
            payload = json.loads(msg)
            if payload.get("type") == "input":
                data = payload.get("data", "")
                try:
                    os.write(master_fd, data.encode("utf-8", errors="replace"))
                except OSError:
                    break
            elif payload.get("type") == "resize":
                rows = int(payload.get("rows", 24))
                cols = int(payload.get("cols", 80))
                winsz = struct.pack("HHHH", rows, cols, 0, 0)
                try:
                    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsz)
                except OSError:
                    pass
            elif payload.get("type") == "close":
                break

    send_task = asyncio.create_task(_send_pty_output(ws, master_fd))
    recv_task = asyncio.create_task(ws_reader())

    done, pending = await asyncio.wait(
        [send_task, recv_task],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()

    try:
        proc.kill()
    except Exception:
        pass
    await proc.wait()
    try:
        await ws.send_text(json.dumps({"type": "exit", "code": proc.returncode}))
    except Exception:
        pass
    try:
        os.close(master_fd)
    except OSError:
        pass


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the AXIOM exec backend service.")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind the server to.")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8001)), help="Port to listen on.")
    parser.add_argument("--log-level", default=os.environ.get("LOG_LEVEL", "info"), help="Uvicorn log level.")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development.")
    args = parser.parse_args()

    uvicorn.run(
        "server:app",
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        reload=args.reload,
    )
