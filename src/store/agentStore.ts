import { create } from 'zustand'
import { Agent, AgentStatus } from '../types'

const API = 'http://localhost:3131/api'

interface AgentStore {
  agents: Agent[]
  loading: boolean
  fetchAgents: () => Promise<void>
  createAgent: (name: string, workingDir: string, safeMode?: boolean) => Promise<Agent>
  updateAgent: (id: string, name: string, workingDir: string, safeMode?: boolean) => Promise<void>
  toggleSafeMode: (id: string) => Promise<void>
  removeAgent: (id: string) => Promise<void>
  setStatus: (id: string, status: AgentStatus) => void
  sendPrompt: (id: string, prompt: string) => Promise<void>
  sendStdin: (id: string, input: string) => Promise<void>
  stopAgent: (id: string) => Promise<void>
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  loading: false,

  fetchAgents: async () => {
    set({ loading: true })
    const res = await fetch(`${API}/agents`)
    const agents: Agent[] = await res.json()
    set({ agents, loading: false })
  },

  createAgent: async (name, workingDir, safeMode = false) => {
    const res = await fetch(`${API}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, workingDir, safeMode }),
    })
    const agent: Agent = await res.json()
    set((s) => ({ agents: [...s.agents, agent] }))
    return agent
  },

  updateAgent: async (id, name, workingDir, safeMode) => {
    const agent = get().agents.find((a) => a.id === id)
    const res = await fetch(`${API}/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, workingDir, safeMode: safeMode ?? agent?.safeMode ?? false }),
    })
    const updated: Agent = await res.json()
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? updated : a)) }))
  },

  toggleSafeMode: async (id) => {
    const agent = get().agents.find((a) => a.id === id)
    if (!agent) return
    const newVal = !agent.safeMode
    // Optimistic update
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, safeMode: newVal } : a)),
    }))
    await fetch(`${API}/agents/${id}/safe-mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ safeMode: newVal }),
    })
  },

  removeAgent: async (id) => {
    await fetch(`${API}/agents/${id}`, { method: 'DELETE' })
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  },

  setStatus: (id, status) => {
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, status } : a)),
    }))
  },

  sendPrompt: async (id, prompt) => {
    await fetch(`${API}/agents/${id}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
  },

  sendStdin: async (id, input) => {
    await fetch(`${API}/agents/${id}/stdin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    })
  },

  stopAgent: async (id) => {
    await fetch(`${API}/agents/${id}/stop`, { method: 'POST' })
  },
}))
