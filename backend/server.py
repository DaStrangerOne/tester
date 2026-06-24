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

import asyncio
import os
import shutil
import tempfile
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
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


def _check_auth(authorization: Optional[str]) -> None:
    """Optional bearer-token check. Only enforced when AXIOM_BACKEND_TOKEN is set."""
    if not AXIOM_BACKEND_TOKEN:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    if authorization.split(None, 1)[1].strip() != AXIOM_BACKEND_TOKEN:
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
