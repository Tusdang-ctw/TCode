import { AgentWithStatus } from '../store/agentStore'
import { AgentPanel } from './AgentPanel'

interface Props {
  agents: AgentWithStatus[]
  onRemove: (id: string) => void
  onEdit: (agent: AgentWithStatus) => void
  onStop: (id: string) => void
  onRestart: (id: string, cols: number, rows: number) => void
  onPtyStatus: (id: string, alive: boolean) => void
}

// Compute CSS grid columns based on agent count
function getColCount(count: number): number {
  if (count === 1) return 1
  if (count <= 4) return 2
  if (count <= 9) return 3
  return 4
}

export function AgentGrid({ agents, onRemove, onEdit, onStop, onRestart, onPtyStatus }: Props) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-terminal-muted font-mono gap-4">
        <div className="text-6xl opacity-20">{'\u2B21'}</div>
        <p className="text-lg">No agents yet</p>
        <p className="text-sm opacity-60">Click "+ New Agent" to add one</p>
      </div>
    )
  }

  const cols = getColCount(agents.length)
  const rows = Math.ceil(agents.length / cols)

  return (
    <div
      className="grid gap-3 h-full p-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {agents.map((agent) => (
        <AgentPanel
          key={agent.id}
          agent={agent}
          onRemove={onRemove}
          onEdit={onEdit}
          onStop={onStop}
          onRestart={onRestart}
          onPtyStatus={onPtyStatus}
        />
      ))}
    </div>
  )
}
