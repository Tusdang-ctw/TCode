import { Agent } from '../types'
import { AgentPanel } from './AgentPanel'

interface Props {
  agents: Agent[]
  onRemove: (id: string) => void
  onEdit: (agent: Agent) => void
}

// Compute CSS grid columns based on agent count
function gridCols(count: number): string {
  if (count === 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  if (count <= 4) return 'grid-cols-2'
  if (count <= 6) return 'grid-cols-3'
  if (count <= 9) return 'grid-cols-3'
  if (count <= 12) return 'grid-cols-4'
  return 'grid-cols-4'
}

export function AgentGrid({ agents, onRemove, onEdit }: Props) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-terminal-muted font-mono gap-4">
        <div className="text-6xl opacity-20">⬡</div>
        <p className="text-lg">No agents yet</p>
        <p className="text-sm opacity-60">Click "+ New Agent" to add one</p>
      </div>
    )
  }

  return (
    <div className={`grid ${gridCols(agents.length)} gap-3 h-full p-3`}>
      {agents.map((agent) => (
        <AgentPanel key={agent.id} agent={agent} onRemove={onRemove} onEdit={onEdit} />
      ))}
    </div>
  )
}
