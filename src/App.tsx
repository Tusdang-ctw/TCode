import { useEffect, useState } from 'react'
import { AgentGrid } from './components/AgentGrid'
import { AgentModal } from './components/AgentModal'
import { useAgentStore } from './store/agentStore'
import { Agent } from './types'

export default function App() {
  const { agents, fetchAgents, createAgent, updateAgent, removeAgent } = useAgentStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const handleSave = async (name: string, workingDir: string, safeMode: boolean) => {
    if (editingAgent) {
      await updateAgent(editingAgent.id, name, workingDir, safeMode)
    } else {
      await createAgent(name, workingDir, safeMode)
    }
    setModalOpen(false)
    setEditingAgent(null)
  }

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setEditingAgent(null)
  }

  const runningCount = agents.filter((a) => a.status === 'running').length

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
            {runningCount > 0 && (
              <span className="ml-2 text-terminal-yellow">· {runningCount} running</span>
            )}
          </span>
        </div>

        <button
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => { setEditingAgent(null); setModalOpen(true) }}
          className="px-3 py-1.5 text-xs font-mono bg-terminal-blue/15 text-terminal-blue border border-terminal-blue/30 rounded-lg hover:bg-terminal-blue/25 transition-colors"
        >
          + New Agent
        </button>
      </div>

      {/* Main grid */}
      <div className="flex-1 overflow-hidden">
        <AgentGrid agents={agents} onRemove={removeAgent} onEdit={handleEdit} />
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
