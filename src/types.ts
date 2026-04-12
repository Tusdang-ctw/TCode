export type AgentStatus = 'idle' | 'running' | 'error' | 'stopped'

export interface Agent {
  id: string
  name: string
  workingDir: string
  status: AgentStatus
  safeMode: boolean
  createdAt: number
}

export interface WsMessage {
  type: 'data' | 'status' | 'json' | 'done' | 'stdin-request'
  data?: string
  status?: AgentStatus
  code?: number
}
