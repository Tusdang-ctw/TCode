import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { AgentWithStatus } from '../store/agentStore'

const WS_URL = 'ws://localhost:3132'
const MAX_RECONNECT_ATTEMPTS = 15
const BASE_RECONNECT_DELAY_MS = 1000

interface Props {
  agent: AgentWithStatus
  onRemove: (id: string) => void
  onEdit: (agent: AgentWithStatus) => void
  onStop: (id: string) => void
  onRestart: (id: string, cols: number, rows: number) => void
  onPtyStatus: (id: string, alive: boolean) => void
}

export function AgentPanel({ agent, onRemove, onEdit, onStop, onRestart, onPtyStatus }: Props) {
  const termContainerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const mountedRef = useRef(true)

  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    const container = termContainerRef.current
    if (!container) return

    // Create xterm.js terminal
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#76e3ea',
        white: '#e6edf3',
        brightBlack: '#8b949e',
        brightRed: '#f85149',
        brightGreen: '#3fb950',
        brightYellow: '#d29922',
        brightBlue: '#58a6ff',
        brightMagenta: '#bc8cff',
        brightCyan: '#76e3ea',
        brightWhite: '#ffffff',
      },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    // Track the current onData disposable so we can rewire it on reconnect
    let dataDisposable: { dispose(): void } | null = null

    function connectWebSocket() {
      if (!mountedRef.current) return

      const { cols, rows } = termRef.current ?? { cols: 80, rows: 24 }
      const ws = new WebSocket(
        `${WS_URL}/?agentId=${agent.id}&cols=${cols}&rows=${rows}`
      )
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
      }

      ws.onmessage = (event) => {
        const data = event.data as string
        // Check for control messages
        if (data.startsWith('{')) {
          try {
            const msg = JSON.parse(data)
            if (msg.type === 'exit') {
              termRef.current?.writeln(
                `\r\n\x1b[31m[Shell exited with code ${msg.exitCode}]\x1b[0m`
              )
              onPtyStatus(agent.id, false)
              return
            }
            if (msg.type === 'status') {
              onPtyStatus(agent.id, msg.alive)
              return
            }
          } catch {
            // Not valid JSON, treat as terminal data
          }
        }
        termRef.current?.write(data)
      }

      ws.onerror = () => {
        // onclose will fire after this — reconnect logic lives there
      }

      ws.onclose = () => {
        // Clean up the previous onData listener
        dataDisposable?.dispose()
        dataDisposable = null

        if (!mountedRef.current) return

        // Exponential backoff reconnect
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            BASE_RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttemptsRef.current),
            10000
          )
          reconnectAttemptsRef.current++
          reconnectTimerRef.current = setTimeout(connectWebSocket, delay)
        } else {
          termRef.current?.writeln(
            '\r\n\x1b[31m[Connection lost — max reconnect attempts reached]\x1b[0m'
          )
        }
      }

      // Forward keystrokes to PTY via WebSocket
      dataDisposable = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })
    }

    // Initial connection
    connectWebSocket()

    // Handle resize: observe container and update PTY dimensions
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit()
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })
          )
        }
      } catch {
        // Ignore resize errors during teardown
      }
    })
    resizeObserver.observe(container)

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      resizeObserver.disconnect()
      dataDisposable?.dispose()
      const ws = wsRef.current
      if (ws) {
        ws.onclose = null
        ws.close()
      }
      term.dispose()
      termRef.current = null
      wsRef.current = null
      fitRef.current = null
    }
  }, [agent.id])

  const handleStop = () => {
    onStop(agent.id)
  }

  const handleRestart = () => {
    const term = termRef.current
    const cols = term?.cols ?? 80
    const rows = term?.rows ?? 24
    // Clear the terminal for a fresh start
    term?.clear()
    onRestart(agent.id, cols, rows)
  }

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      // Auto-cancel after 3 seconds
      setTimeout(() => setConfirmingDelete(false), 3000)
      return
    }
    onRemove(agent.id)
  }

  return (
    <div className="flex flex-col bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border bg-terminal-bg/50 gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Live status dot */}
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
              agent.ptyAlive ? 'bg-terminal-green' : 'bg-terminal-red'
            }`}
            title={agent.ptyAlive ? 'Terminal running' : 'Terminal stopped'}
          />
          <span className="font-mono text-sm font-semibold text-terminal-text truncate">
            {agent.name}
          </span>
          <span className="font-mono text-xs text-terminal-muted truncate hidden sm:block">
            {agent.workingDir}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Stop / Restart */}
          {agent.ptyAlive ? (
            <button
              onClick={handleStop}
              title="Stop terminal"
              className="px-2 py-1 text-xs text-terminal-muted hover:text-terminal-yellow rounded hover:bg-terminal-yellow/10 transition-colors font-mono"
            >
              stop
            </button>
          ) : (
            <button
              onClick={handleRestart}
              title="Restart terminal"
              className="px-2 py-1 text-xs text-terminal-muted hover:text-terminal-green rounded hover:bg-terminal-green/10 transition-colors font-mono"
            >
              start
            </button>
          )}
          <button
            onClick={() => onEdit(agent)}
            title="Edit agent"
            className="px-2 py-1 text-xs text-terminal-muted hover:text-terminal-blue rounded hover:bg-terminal-border transition-colors font-mono"
          >
            edit
          </button>
          <button
            onClick={handleDelete}
            title={confirmingDelete ? 'Click again to confirm' : 'Remove agent'}
            className={`px-2 py-1 text-xs rounded transition-colors font-mono ${
              confirmingDelete
                ? 'bg-terminal-red/20 text-terminal-red border border-terminal-red/40'
                : 'text-terminal-muted hover:text-terminal-red hover:bg-terminal-red/10'
            }`}
          >
            {confirmingDelete ? 'confirm?' : '\u2715'}
          </button>
        </div>
      </div>

      {/* xterm.js Terminal */}
      <div ref={termContainerRef} className="flex-1 min-h-0" />
    </div>
  )
}
