# AXIOM Static Web App

A standalone browser-based UI for the AXIOM red-team interface.

## Overview

This app is a static HTML/JavaScript prototype built from the supplied AXIOM UI design.
It includes:
- Chat interface with AI provider configuration
- Terminal sandbox with optional backend execution
- Ops dashboard and system stats
- Intel analysis panel
- Arsenal file/tool panel
- Agent spawn and management UI
- Build planner and export utilities
- God Mode + auto-exec toggles

## Run locally

### Option 1: Open directly

Open `index.html` in a browser.

### Option 2: Run a local server

```bash
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000` in your browser.

## Configuration

Use the CONFIG panel to set:
- `Anthropic` or custom API key
- backend execution URL
- backend token
- selected model and system prompt
- custom provider base URL, provider key, and model for OpenRouter, OpenSpace, Lovable, Google Gemini, or other OpenAI-compatible endpoints

The app includes provider presets for OpenRouter, OpenSpace AI, Lovable AI, Together AI, and Google Gemini.

For Google Gemini, select the preset and set your API key in the custom provider key field. The configured endpoint supports `gemini-pro` and automatically sends the key using Google API auth.

Saved settings are persisted in browser local storage.

## Notes

- This app is a front-end prototype and does not include a bundled backend server.
- Backend execution requires a compatible `/exec` endpoint returning JSON with `stdout`, `stderr`, and `exitCode`.
- The UI is designed for offline preview and integration into a larger AXIOM system.
