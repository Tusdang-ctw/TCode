import { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { AgentWithStatus } from '../store/agentStore'

interface Props {
  agent?: AgentWithStatus | null
  onSave: (name: string, workingDir: string, command: string) => void
  onClose: () => void
}

export function AgentModal({ agent, onSave, onClose }: Props) {
  const [name, setName] = useState(agent?.name ?? '')
  const [workingDir, setWorkingDir] = useState(agent?.workingDir ?? '')
  const [command, setCommand] = useState(agent?.command ?? '')

  useEffect(() => {
    setName(agent?.name ?? '')
    setWorkingDir(agent?.workingDir ?? '')
    setCommand(agent?.command ?? '')
  }, [agent])

  const handleBrowse = async () => {
    try {
      const dir = await open({ directory: true, multiple: false })
      if (dir && typeof dir === 'string') setWorkingDir(dir)
    } catch (e) {
      console.error('Dialog error:', e)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !workingDir.trim()) return
    onSave(name.trim(), workingDir.trim(), command.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-terminal-panel border border-terminal-border rounded-xl p-6 w-full max-w-md shadow-2xl font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-terminal-text text-lg font-semibold mb-5">
          {agent ? 'Edit Agent' : 'New Agent'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-terminal-muted uppercase tracking-wider">Name</span>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Frontend, API, Docs"
              className="bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-terminal-text text-sm outline-none focus:border-terminal-blue transition-colors placeholder-terminal-muted"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-terminal-muted uppercase tracking-wider">Working Directory</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                placeholder="C:\Users\you\project"
                className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-terminal-text text-sm outline-none focus:border-terminal-blue transition-colors placeholder-terminal-muted"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="px-3 py-2 text-xs bg-terminal-border hover:bg-terminal-border/70 text-terminal-text rounded-lg transition-colors"
              >
                Browse
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-terminal-muted uppercase tracking-wider">Startup Command</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. npm run dev, claude, python app.py"
              className="bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-terminal-text text-sm outline-none focus:border-terminal-blue transition-colors placeholder-terminal-muted"
            />
            <span className="text-xs text-terminal-muted mt-0.5">
              Optional — runs automatically when the terminal starts
            </span>
          </label>

          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-terminal-muted hover:text-terminal-text rounded-lg hover:bg-terminal-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !workingDir.trim()}
              className="px-4 py-2 text-sm bg-terminal-blue/20 text-terminal-blue border border-terminal-blue/40 rounded-lg hover:bg-terminal-blue/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {agent ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
