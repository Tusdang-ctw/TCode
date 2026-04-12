import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Agent } from '../types'
import { useAgentStore } from '../store/agentStore'
import { useAgentSocket } from '../hooks/useAgentSocket'

const STATUS_COLOR: Record<string, string> = {
  idle: 'bg-terminal-green',
  running: 'bg-terminal-yellow animate-pulse',
  error: 'bg-terminal-red',
  stopped: 'bg-terminal-muted',
}

interface Props {
  agent: Agent
  onRemove: (id: string) => void
  onEdit: (agent: Agent) => void
}

export function AgentPanel({ agent, onRemove, onEdit }: Props) {
  const { sendPrompt, sendStdin, stopAgent, toggleSafeMode } = useAgentStore()
  const termRef = useRef<HTMLDivElement>(null)
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [prompt, setPrompt] = useState('')
  const [stdinInput, setStdinInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  useAgentSocket(agent.id, terminal)

  useEffect(() => {
    if (!termRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#0d1117',
        brightBlack: '#8b949e',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#e6edf3',
        brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)
    term.open(termRef.current)
    fitAddon.fit()

    term.writeln('\x1b[2m\x1b[36m── TCode ──\x1b[0m')
    term.writeln(`\x1b[2mAgent: \x1b[0m\x1b[1m${agent.name}\x1b[0m`)
    term.writeln(`\x1b[2mDir:   \x1b[0m${agent.workingDir}`)
    term.writeln(`\x1b[2mMode:  \x1b[0m${agent.safeMode ? '\x1b[33mSafe (confirmations on)\x1b[0m' : '\x1b[32mAuto-approve\x1b[0m'}`)
    term.writeln('')

    setTerminal(term)

    const ro = new ResizeObserver(() => fitAddon.fit())
    ro.observe(termRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = prompt.trim()
    if (!p || agent.status === 'running') return
    terminal?.writeln(`\r\n\x1b[36m\x1b[1m> ${p}\x1b[0m\r\n`)
    setHistory((h) => [p, ...h.slice(0, 99)])
    setHistoryIdx(-1)
    setPrompt('')
    await sendPrompt(agent.id, p)
  }

  const handleStdinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = stdinInput.trim()
    if (!val) return
    terminal?.writeln(`\r\n\x1b[35m↳ ${val}\x1b[0m`)
    setStdinInput('')
    await sendStdin(agent.id, val)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      const idx = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(idx)
      setPrompt(history[idx] ?? '')
      e.preventDefault()
    } else if (e.key === 'ArrowDown') {
      const idx = Math.max(historyIdx - 1, -1)
      setHistoryIdx(idx)
      setPrompt(idx === -1 ? '' : history[idx])
      e.preventDefault()
    }
  }

  const clearTerminal = () => terminal?.clear()

  const safeModeColor = agent.safeMode
    ? 'text-terminal-yellow border-terminal-yellow/40 bg-terminal-yellow/10'
    : 'text-terminal-muted border-terminal-border bg-transparent'

  return (
    <div className="flex flex-col bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border bg-terminal-bg/50 gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLOR[agent.status]}`} />
          <span className="font-mono text-sm font-semibold text-terminal-text truncate">{agent.name}</span>
          <span className="font-mono text-xs text-terminal-muted truncate hidden sm:block">{agent.workingDir}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Safe Mode quick toggle */}
          <button
            onClick={() => toggleSafeMode(agent.id)}
            title={agent.safeMode ? 'Safe Mode ON — click to disable' : 'Safe Mode OFF — click to enable'}
            className={`px-2 py-1 text-xs border rounded font-mono transition-colors ${safeModeColor} hover:opacity-80`}
          >
            {agent.safeMode ? '🔒 safe' : '⚡ auto'}
          </button>

          <button
            onClick={clearTerminal}
            title="Clear terminal"
            className="px-2 py-1 text-xs text-terminal-muted hover:text-terminal-text rounded hover:bg-terminal-border transition-colors font-mono"
          >
            clr
          </button>
          {agent.status === 'running' && (
            <button
              onClick={() => stopAgent(agent.id)}
              title="Stop agent"
              className="px-2 py-1 text-xs text-terminal-red hover:bg-terminal-red/10 rounded transition-colors font-mono"
            >
              stop
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
            onClick={() => onRemove(agent.id)}
            title="Remove agent"
            className="px-2 py-1 text-xs text-terminal-muted hover:text-terminal-red rounded hover:bg-terminal-red/10 transition-colors font-mono"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div ref={termRef} className="flex-1 overflow-hidden p-1" />

      {/* Stdin input — only shown in safe mode while running */}
      {agent.safeMode && agent.status === 'running' && (
        <form
          onSubmit={handleStdinSubmit}
          className="flex gap-2 px-2 py-1.5 border-t border-terminal-yellow/30 bg-terminal-yellow/5 flex-shrink-0"
        >
          <span className="font-mono text-terminal-yellow text-xs self-center flex-shrink-0">confirm:</span>
          <input
            type="text"
            value={stdinInput}
            onChange={(e) => setStdinInput(e.target.value)}
            placeholder='Type "y" or "n" and press Enter…'
            autoFocus
            className="flex-1 bg-transparent font-mono text-xs text-terminal-text placeholder-terminal-muted outline-none"
          />
          <button
            type="submit"
            disabled={!stdinInput.trim()}
            className="px-2 py-1 text-xs font-mono bg-terminal-yellow/20 text-terminal-yellow border border-terminal-yellow/30 rounded hover:bg-terminal-yellow/30 transition-colors disabled:opacity-40"
          >
            send
          </button>
        </form>
      )}

      {/* Prompt input */}
      <form onSubmit={handleSubmit} className="flex gap-2 p-2 border-t border-terminal-border bg-terminal-bg/30 flex-shrink-0">
        <span className="font-mono text-terminal-blue text-sm flex-shrink-0 self-center">❯</span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={agent.status === 'running' ? 'Agent is running…' : 'Enter prompt and press Enter…'}
          disabled={agent.status === 'running'}
          className="flex-1 bg-transparent font-mono text-sm text-terminal-text placeholder-terminal-muted outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={agent.status === 'running' || !prompt.trim()}
          className="px-3 py-1 text-xs font-mono bg-terminal-blue/20 text-terminal-blue border border-terminal-blue/30 rounded hover:bg-terminal-blue/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          run
        </button>
      </form>
    </div>
  )
}
