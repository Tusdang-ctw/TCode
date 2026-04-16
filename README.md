# TCode

A Windows desktop app for running multiple Claude Code agents simultaneously in a unified terminal dashboard.

Built with Tauri 2, React, and Node.js.

![Windows](https://img.shields.io/badge/platform-Windows-blue)

## Features

- Run multiple Claude Code agents side by side in a responsive grid
- Each agent gets its own interactive terminal (xterm.js + node-pty)
- Set custom working directories and startup commands per agent
- Start, stop, restart, edit, and delete agents on the fly
- Agents persist across app restarts (SQLite)
- Real-time terminal I/O over WebSocket

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (for building from source)

## Quick Start

```bash
# Clone and install
git clone https://github.com/Tusdang-ctw/TCode.git
cd TCode
npm install

# Run in development mode
npm run dev
```

## Build

```bash
npm run build
```

Produces installers at:
- `src-tauri/target/release/bundle/nsis/TCode_x.x.x_x64-setup.exe` (NSIS)
- `src-tauri/target/release/bundle/msi/TCode_x.x.x_x64_en-US.msi` (MSI)

> **Note:** The built app requires Node.js installed on the target machine.

## Architecture

```
Tauri (Rust)
  └─ spawns Node.js server as child process
       ├─ Express REST API (:3131)    — agent CRUD
       ├─ WebSocket server (:3132)    — real-time terminal I/O
       ├─ AgentManager (node-pty)     — PTY process lifecycle
       └─ SQLite (better-sqlite3)     — persistent storage

React frontend
  ├─ Zustand store                    — state + HTTP calls
  └─ xterm.js terminals              — WebSocket to PTY
```

The frontend runs inside Tauri's WebView. Since native Node.js addons (node-pty, better-sqlite3) can't run in a browser context, a localhost Node.js server acts as an IPC bridge between the WebView and the system.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Build server + launch Tauri dev mode |
| `npm run build` | Production build (NSIS/MSI installers) |
| `npm run dev:services` | Server + Vite only (browser at localhost:5173) |
| `npm run server:dev` | Node.js server only |
| `npm run vite:dev` | Vite dev server only |

## Data

- Database: `~/.tcode/sessions.db`
- Server logs: `~/.tcode/server.log`

## License

MIT
