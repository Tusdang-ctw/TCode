import { useEffect, useState } from 'react'
import { AgentGrid } from './components/AgentGrid'
import { AgentModal } from './components/AgentModal'
import { useAgentStore, AgentWithStatus } from './store/agentStore'

export default function App() {
  const {
    agents, fetchAgents, createAgent, updateAgent, removeAgent,
    stopAgent, restartAgent, setPtyAlive, error, setError, serverConnected,
  } = useAgentStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentWithStatus | null>(null)

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const handleSave = async (name: string, workingDir: string, command: string) => {
    try {
      if (editingAgent) {
        await updateAgent(editingAgent.id, name, workingDir, command)
      } else {
        await createAgent(name, workingDir, command)
      }
      setModalOpen(false)
      setEditingAgent(null)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleEdit = (agent: AgentWithStatus) => {
    setEditingAgent(agent)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setEditingAgent(null)
  }

  const handleRemove = async (id: string) => {
    try { await removeAgent(id) }
    catch (e) { setError(String(e)) }
  }

  const handleStop = async (id: string) => {
    try { await stopAgent(id) }
    catch (e) { setError(String(e)) }
  }

  const handleRestart = async (id: string, cols: number, rows: number) => {
    try { await restartAgent(id, cols, rows) }
    catch (e) { setError(String(e)) }
  }

  return (
    <div className="flex flex-col h-screen bg-terminal-bg text-terminal-text select-none overflow-hidden">
      {/* Titlebar / Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-terminal-border bg-terminal-panel flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="font-mono text-sm font-semibold text-terminal-blue">TCode</span>
          <span className="font-mono text-xs text-terminal-muted">
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </span>
          {!serverConnected && (
            <span className="font-mono text-xs text-terminal-red flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-terminal-red inline-block" />
              Server disconnected
            </span>
          )}
        </div>

        <button
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => { setEditingAgent(null); setModalOpen(true) }}
          disabled={!serverConnected}
          className={`px-3 py-1.5 text-xs font-mono border rounded-lg transition-colors ${
            serverConnected
              ? 'bg-terminal-blue/15 text-terminal-blue border-terminal-blue/30 hover:bg-terminal-blue/25'
              : 'bg-terminal-muted/10 text-terminal-muted border-terminal-border cursor-not-allowed'
          }`}
          title={serverConnected ? 'Create a new agent' : 'Backend server is not connected'}
        >
          + New Agent
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-2 bg-red-900/40 border-b border-red-500/40 text-red-400 text-xs font-mono flex-shrink-0 cursor-pointer"
          onClick={() => setError(null)}
          title="Click to dismiss"
        >
          {error}
        </div>
      )}

      {/* Main grid */}
      <div className="flex-1 overflow-hidden">
        <AgentGrid
          agents={agents}
          onRemove={handleRemove}
          onEdit={handleEdit}
          onStop={handleStop}
          onRestart={handleRestart}
          onPtyStatus={setPtyAlive}
        />
      </div>

      {/* Modal */}
      {modalOpen && (
        <AgentModal
          agent={editingAgent}
          onSave={handleSave}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}
