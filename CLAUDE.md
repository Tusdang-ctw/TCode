# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is TCode

TCode is a Tauri 2 desktop app for running multiple Claude Code agents simultaneously in a terminal dashboard. It combines a React frontend (xterm.js terminals), a Node.js backend (Express + WebSocket + node-pty), and a Rust/Tauri shell that spawns the Node.js server as a child process.

## Commands

```bash
npm run dev              # Build server + launch Tauri dev mode (full app)
npm run build            # Production build → NSIS/MSI installers
npm run dev:services     # Server + Vite only (browser at localhost:5173, no Tauri)
npm run server:dev       # Node.js server only (tsx, port 3131/3132)
npm run server:build     # Bundle server to dist-server/server.cjs
npm run vite:dev         # Vite dev server only (port 5173)
```

No test suite exists yet.

## Architecture

```
Tauri (Rust, lib.rs)
  └─ spawns Node.js child process
       └─ Express REST API (:3131)     ← agent CRUD
       └─ WebSocket server (:3132)     ← real-time PTY I/O
       └─ AgentManager                 ← node-pty process lifecycle
       └─ SQLite (better-sqlite3)      ← ~/.tcode/sessions.db

React frontend (src/)
  └─ Zustand store (agentStore.ts)     ← HTTP calls to :3131
  └─ AgentPanel (xterm.js)             ← WebSocket to :3132
```

The frontend cannot use node-pty or better-sqlite3 directly (native C++ addons), so localhost serves as an IPC bridge between the WebView and Node.js.

## Key files

- **src-tauri/src/lib.rs** — Tauri setup, finds Node.js, spawns server, handles resource path resolution for NSIS installs (resources live in `_up_/` folder)
- **server/index.ts** — Express routes + WebSocket connection handler, wires AgentManager events to clients
- **server/AgentManager.ts** — PTY spawn/kill/resize, shell detection (pwsh on Windows, $SHELL on Unix)
- **server/db.ts** — SQLite schema, CRUD operations, auto-migration for `command` column
- **src/store/agentStore.ts** — Zustand store, all HTTP calls to backend, server connectivity tracking
- **src/components/AgentPanel.tsx** — xterm.js terminal, WebSocket lifecycle, reconnect with exponential backoff (15 attempts)
- **build-server.mjs** — esbuild config bundling server to single CJS file (externalizes native modules)

## Production build gotchas

- NSIS installer puts bundled resources in `_up_/` next to the exe, not in Tauri's `resource_dir()`. The Rust code searches multiple candidate paths.
- NODE_PATH must be derived relative to wherever `server.cjs` is found, not hardcoded to `resource_dir`.
- Node.js server must be spawned with `CREATE_NO_WINDOW` flag (0x08000000) on Windows to avoid visible console.
- Server logs go to `~/.tcode/server.log` for debugging production issues.
- Native modules (node-pty, better-sqlite3) are listed individually in `tauri.conf.json` bundle resources — if a new native dependency is added, its files must be enumerated there.
- CORS is set to `*` because the Tauri WebView origin varies by platform and is hard to predict.

## Conventions

- TypeScript strict mode, ES2020 target
- Tailwind CSS with custom `terminal-*` color tokens (defined in tailwind.config.js)
- Express 5 (not 4) — route params use `req.params.id` directly
- Ports are hardcoded: 3131 (HTTP), 3132 (WebSocket), 5173 (Vite dev)
- Database at `~/.tcode/sessions.db`, created automatically on first run
