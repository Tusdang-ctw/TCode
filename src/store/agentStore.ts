import { create } from 'zustand'
import { Agent } from '../types'

const API = 'http://localhost:3131/api'

export interface AgentWithStatus extends Agent {
  ptyAlive: boolean
}

interface AgentStore {
  agents: AgentWithStatus[]
  loading: boolean
  error: string | null
  serverConnected: boolean
  setError: (msg: string | null) => void
  fetchAgents: () => Promise<void>
  createAgent: (name: string, workingDir: string, command: string) => Promise<AgentWithStatus>
  updateAgent: (id: string, name: string, workingDir: string, command: string) => Promise<void>
  removeAgent: (id: string) => Promise<void>
  stopAgent: (id: string) => Promise<void>
  restartAgent: (id: string, cols?: number, rows?: number) => Promise<void>
  setPtyAlive: (id: string, alive: boolean) => void
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Wrap fetch calls with user-friendly error messages */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    // Network error = server not reachable
    throw new Error(
      'Cannot reach backend server (localhost:3131). ' +
      'Make sure Node.js is installed and the server is running.'
    )
  }
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loading: false,
  error: null,
  serverConnected: false,

  setError: (msg) => set({ error: msg }),

  fetchAgents: async () => {
    set({ loading: true, error: null })

    // Retry up to 10 times — the Node.js server may still be starting
    const MAX_RETRIES = 10
    const RETRY_DELAY_MS = 800

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${API}/agents`)
        if (!res.ok) throw new Error(`Server error: ${res.status}`)
        const agents: AgentWithStatus[] = await res.json()
        set({ agents, loading: false, serverConnected: true })
        return
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY_MS)
        }
      }
    }

    set({
      error: 'Cannot connect to backend server. Make sure Node.js is installed and the app is running correctly.',
      loading: false,
      serverConnected: false,
    })
  },

  createAgent: async (name, workingDir, command) => {
    const res = await apiFetch(`${API}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, workingDir, command }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Failed to create agent (HTTP ${res.status})`)
    }
    const agent: AgentWithStatus = await res.json()
    set((s) => ({ agents: [...s.agents, agent] }))
    return agent
  },

  updateAgent: async (id, name, workingDir, command) => {
    const res = await apiFetch(`${API}/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, workingDir, command }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Failed to update agent (HTTP ${res.status})`)
    }
    const updated: AgentWithStatus = await res.json()
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? updated : a)) }))
  },

  removeAgent: async (id) => {
    const res = await apiFetch(`${API}/agents/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Failed to delete agent (HTTP ${res.status})`)
    }
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  },

  stopAgent: async (id) => {
    const res = await apiFetch(`${API}/agents/${id}/stop`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Failed to stop agent (HTTP ${res.status})`)
    }
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ptyAlive: false } : a)),
    }))
  },

  restartAgent: async (id, cols = 80, rows = 24) => {
    const res = await apiFetch(`${API}/agents/${id}/restart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols, rows }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Failed to restart agent (HTTP ${res.status})`)
    }
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ptyAlive: true } : a)),
    }))
  },

  setPtyAlive: (id, alive) => {
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ptyAlive: alive } : a)),
    }))
  },
}))
