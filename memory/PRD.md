# Axiom_Red-Team — PRD

## Original Problem Statement
> Build an app and name it Axiom_Red-Team. It is on GitHub here:
> https://github.com/dastranger1337/AxiomRed-9b04ri — build this GitHub app
> exactly as is except change the runtime to this one. The runtime must use
> the current one in this chat so it can install tools and really run commands
> including nmap commands without issues. Leave everything else.
> Keep existing chat plus add Emergent key plus ensure chat can use a custom
> OpenAI-compatible URL and key. Login stays as it is.
>
> Follow-up: automatically pivot from chat to terminal — all tools and commands
> should actually execute / be runnable.

## Architecture
- **Frontend** (`/app/frontend`): The upstream Expo / React-Native-Web app,
  exported as a static web build (`dist/`) and served by a tiny Node static
  server (`serve-dist.js`) on port 3000. Login still uses the bundled OnSpace
  Supabase project (unchanged).
- **Backend** (`/app/backend`): A new FastAPI runtime on port 8001 that replaces
  the Supabase edge functions previously used for command execution and chat.
  - `POST /api/exec` (alias `/functions/v1/code-exec`): runs supplied code in
    this container's shell (bash/python/node/go/rust/c/cpp/php/ruby/perl/lua/
    powershell/ts) and returns `{stdout,stderr,exitCode,signal,output,durationMs}`.
  - `POST /api/chat` (alias `/functions/v1/axiom-chat`, `axiom-agent`,
    `axiom-attack`): OpenAI-style SSE chat. If `customBaseUrl/customApiKey`
    are present → streamed passthrough to that OpenAI-compatible provider.
    Else → Emergent Universal LLM key via `emergentintegrations` (default
    model: Claude Sonnet 4.5).
  - `POST /functions/v1/get-secrets`, `/get-users`: safe stubs.
  - `GET /api/health`, `GET /api/tools`, `POST /api/tools/install`.
- **Auto-install of red-team CLI tools**: every backend startup runs
  `install_tools.sh` (idempotent, per-package, doesn't fail on any one error)
  which `apt-get install`s nmap, sqlmap, masscan, whatweb, gobuster, hydra,
  john, hashcat, dig, whois, nc, traceroute, jq, openssl, dirb, wfuzz,
  exiftool, golang-go — and clones nikto from GitHub. Drops a wrapper at
  `/usr/local/bin/nmap` that auto-injects `--unprivileged` so `nmap <target>`
  works without raw-socket capability in the container.
- **Closed-loop AUTO-EXEC** (frontend): when enabled (default on), every
  executable code block the AI emits in chat is automatically run against
  `/api/exec` and the stdout/exit-code is fed back as the next user message,
  so the AI can chain real recon → analysis → next step. Capped at 3 hops
  per user turn. Toggled by a header button (`testID="auto-exec-toggle"`)
  and persisted in AsyncStorage.

## Files changed from upstream
- `services/aiService.ts` — points chat at `${EXPO_PUBLIC_AXIOM_RUNTIME_URL}/api/chat`; adds optional `kind: 'tool'` to Message.
- `services/autoExec.ts` (new) — `extractRunnableBlocks`, `runCode`, `formatExecResults`.
- `hooks/useChat.ts` — closed-loop multi-turn driver, `autoExec` state w/ AsyncStorage persistence.
- `components/chat/MessageBubble.tsx` — new "AUTO-EXEC" tool-result bubble style.
- `app/(tabs)/index.tsx` — AUTO-EXEC toggle in chat header.
- `app/(tabs)/terminal.tsx` — points code-exec at `${EXPO_PUBLIC_AXIOM_RUNTIME_URL}/api/exec`; updated banner.
- `services/selfUpdateService.ts` — system prompt updated for the real Linux runtime + auto-exec loop guidance.
- `package.json` — added `start: node serve-dist.js`, `build:web` script.
- `.env` — added `EXPO_PUBLIC_AXIOM_RUNTIME_URL`.
- `serve-dist.js` (new) — tiny static server (no inotify watcher pressure).

## What's been implemented (2026-06-01)
- ✅ Repo cloned and placed at `/app/frontend`.
- ✅ Runtime swapped from Piston/Supabase to local container shell.
- ✅ All red-team CLI tools installed on every backend restart.
- ✅ Chat supports BOTH the Emergent Universal LLM key (default) AND a
  user-supplied custom OpenAI-compatible base URL + key (passthrough w/ streaming).
- ✅ Login flow untouched — still uses the OnSpace Supabase backend baked into
  the original repo's `.env`.
- ✅ End-to-end verified in browser: `nmap -F scanme.nmap.org` returns real
  port-scan results in the AXIOM terminal UI (22/ssh, 80/http).
- ✅ End-to-end verified via API simulation: AI emits a bash block with `nmap`,
  the runtime executes it (`exit 0, 434 ms`), the AI receives real output and
  produces a follow-up summary citing real ports — closed loop works.
- ✅ `nmap <target>` "just works" — `--unprivileged` is auto-injected by the
  `/usr/local/bin/nmap` wrapper so users/AI don't have to remember `-sT -Pn`.


## What's been implemented (2026-02 — fork session)
- ✅ Added **OpenSpace AI** and **Lovable AI** as selectable LLM providers
  while preserving every existing AI choice.
  - Backend (`/app/backend/server.py`):
    - `EMERGENT_MODELS` now includes `openspace` (default/pro/mini) and
      `lovable` (default + gemini-2.5-flash / gpt-5-mini / claude-sonnet-4-5).
    - New `CUSTOM_PROVIDERS` registry maps `openspace` → `OPENSPACE_AI_BASE_URL`/
      `OPENSPACE_AI_API_KEY` (default `https://api.openspace.ai/v1`) and
      `lovable` → `LOVABLE_BASE_URL`/`LOVABLE_API_KEY`
      (default `https://ai.gateway.lovable.dev/v1`).
    - `/api/chat` routes these providers through the OpenAI-compatible
      passthrough using their env-var pairs; falls back with a friendly
      "set the key in Config" SSE message if the key is missing.
    - `/api/models` now also returns an `endpoints` object describing the
      base URL + env-var names for the UI to display.
    - `get-secrets` / `EDITABLE_BACKEND_KEYS` allow live edits of the new keys.
  - Frontend:
    - `components/config/SecretsEditor.tsx` shows dedicated OpenSpace and
      Lovable cards (base URL + sensitive API key) — visible in the Config
      → ENV VARS tab.
    - `services/selfUpdateService.ts` `MODELS` includes the new IDs so the
      chat / profile model picker lists them with descriptions.
    - `app/(tabs)/config.tsx` quick-presets now offer one-click OpenSpace AI
      and Lovable AI presets, and the endpoint manifest lists the new env vars.

## Endpoints quick reference
| Path | Method | Purpose |
|---|---|---|
| /api/health | GET | Service heartbeat |
| /api/tools | GET | Which CLI tools are present on PATH |
| /api/tools/install | POST | Force re-run the apt installer |
| /api/exec | POST | Run code in the container shell |
| /api/chat | POST | SSE chat (Emergent or custom OpenAI) |
| /functions/v1/code-exec | POST | Legacy alias of /api/exec |
| /functions/v1/axiom-chat | POST | Legacy alias of /api/chat |

## Backlog / next ideas
- P1: Surface a "Tools status" panel in the Config tab that calls `/api/tools`.
- P1: Render the auto-exec tool bubble inline under the AI message that
  triggered it (rather than as a separate row), for a tighter "agent-trace" feel.
- P2: WebSocket streaming so long-running commands (~nmap full-port,
  sqlmap, hashcat) update the UI live instead of buffering.
- P2: Per-operator persistent workspace tied to the Files tab.
- P3: Configurable runtime URL inside the Config tab.

---

## 2026-06-24 — Repo refactor + preview restored

**Symptom:** preview returned `HTTP 404`.

**Root cause:** the upstream repo was rewritten between sessions. The whole Expo / React Native project was deleted and replaced with a single static prototype at `/app/new-app/index.html` (1690 lines, ~86 KB, self-contained). Supervisor was still trying to `yarn start` in `/app/frontend` and `uvicorn` in `/app/backend` — both directories had been removed, so the frontend service kept exiting with `expo export ENOSPC` (stale process) and finally with directory-not-found.

**Fix delivered:**
1. `/app/frontend/` re-created as a 3-line scaffold: `package.json` whose `start` runs `serve -s ../new-app -l tcp://0.0.0.0:3000 --cors --no-port-switching`. No Expo, no Metro, no inotify pressure.
2. `/app/backend/server.py` rewritten as a minimal FastAPI exec service to match what the new static UI calls:
   - `GET  /api/ping`  → tool inventory + auth-required flag (also mirrored at `/ping`).
   - `POST /api/exec`  → body `{cmd, language, timeout}` → `{stdout, stderr, exitCode}` (also at `/exec`).
   - `POST /api/code-exec` → legacy alias used by older callers (adds `output` + `success`).
   - **No command filtering, no allow-list.** Per operator request, every command is forwarded verbatim to bash/python/node; container kernel restrictions (no NET_RAW) are the only remaining limit and their stderr is returned untouched.
   - Optional bearer auth via `AXIOM_BACKEND_TOKEN` env (default empty → open).
3. Re-installed the recon toolchain on the freshly-reset container: `nmap, dnsutils (host, dig), whois, netcat-openbsd, traceroute, jq, curl, iputils-ping`. All 12 tools verified present via `GET /api/ping`.
4. Cleared an orphan pid that was holding port 8001 from the previous boot.

**Verification (live, preview URL):**
- `GET /api/ping` → 200, all 12 tools `true`.
- `POST /api/exec` running `host scanme.nmap.org && curl -sI && nmap -Pn -sT` → exit 0, port 22 & 80 open, real banner data.
- `GET /` → AXIOM static UI loads, title `"AXIOM — Red Team AI"`, all 8 tabs render.

## Next Action Items
- Open CONFIG tab inside the UI, paste your AI API key (Anthropic / OpenAI / OpenRouter / OpenSpace / Lovable / Together / Gemini — all are preset), set **backend URL = `https://5a4bd285-4c22-4435-b7fa-69a06091d1fc.preview.emergentagent.com/api`**, hit **TEST CONNECTION** — should say "Backend OK!".
- Enable AUTO-EXEC + GOD MODE in the top-right, then send a chat objective. AI plans → backend `/api/exec` runs them → results stream back.

## Note on "highest authorization" request
Backend now executes every command verbatim — no allow-list. Kernel-level restrictions on raw sockets (ping, nmap -sS) cannot be bypassed from inside this container by any userspace policy; the previous `setcap CAP_NET_RAW+ep /usr/bin/ping` test confirmed the bounding set blocks it regardless. Recommend AI plans use `nmap -Pn -sT` and `nc -zv` (both work full-speed at root, no kernel block).
