import express from 'express'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { AgentManager } from './AgentManager'
import { dbOps } from './db'

const PORT_HTTP = 3131
const PORT_WS = 3132

export const agentManager = new AgentManager()

// WebSocket clients map: agentId -> Set<WebSocket>
const subscribers = new Map<string, Set<WebSocket>>()

function broadcast(agentId: string, msg: object) {
  const clients = subscribers.get(agentId)
  if (!clients) return
  const payload = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload)
  }
}

// Attach AgentManager events → WebSocket broadcasts
agentManager.on('agent:data', ({ agentId, data }) => {
  broadcast(agentId, { type: 'data', data })
})
agentManager.on('agent:json', ({ agentId, data }) => {
  broadcast(agentId, { type: 'json', data })
})
agentManager.on('agent:status', ({ agentId, status }) => {
  broadcast(agentId, { type: 'status', status })
})
agentManager.on('agent:done', ({ agentId, code }) => {
  broadcast(agentId, { type: 'done', code })
})
agentManager.on('agent:error', ({ agentId, data }) => {
  broadcast(agentId, { type: 'data', data })
})
agentManager.on('agent:removed', ({ agentId }) => {
  subscribers.delete(agentId)
})

export async function startServer(): Promise<void> {
  // Restore agents from DB
  const saved = dbOps.getAllAgents()
  for (const row of saved) {
    agentManager.createAgent(row.id, row.name, row.working_dir, row.safe_mode === 1)
  }

  // ── Express REST API ──────────────────────────────────────────────
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    next()
  })
  app.options('*', (_req, res) => res.sendStatus(200))

  // GET /api/agents
  app.get('/api/agents', (_req, res) => {
    res.json(agentManager.getAllAgents())
  })

  // POST /api/agents — create agent
  app.post('/api/agents', (req, res) => {
    const { name, workingDir, safeMode = false } = req.body as { name: string; workingDir: string; safeMode?: boolean }
    if (!name || !workingDir) return res.status(400).json({ error: 'name and workingDir required' })
    const id = randomUUID()
    const agent = agentManager.createAgent(id, name, workingDir, safeMode)
    dbOps.saveAgent(id, name, workingDir, safeMode, agent.createdAt)
    res.json(agent)
  })

  // PUT /api/agents/:id — update name/workingDir/safeMode
  app.put('/api/agents/:id', (req, res) => {
    const { name, workingDir, safeMode } = req.body as { name?: string; workingDir?: string; safeMode?: boolean }
    const agent = agentManager.getAgent(req.params.id)
    if (!agent) return res.status(404).json({ error: 'Not found' })
    const updated = agentManager.updateAgent(req.params.id, {
      name: name ?? agent.name,
      workingDir: workingDir ?? agent.workingDir,
      safeMode: safeMode ?? agent.safeMode,
    })
    if (updated) dbOps.updateAgent(updated.id, updated.name, updated.workingDir, updated.safeMode)
    res.json(updated)
  })

  // DELETE /api/agents/:id
  app.delete('/api/agents/:id', (req, res) => {
    agentManager.removeAgent(req.params.id)
    dbOps.deleteAgent(req.params.id)
    res.json({ ok: true })
  })

  // POST /api/agents/:id/prompt — send prompt
  app.post('/api/agents/:id/prompt', (req, res) => {
    const { prompt } = req.body as { prompt: string }
    if (!prompt) return res.status(400).json({ error: 'prompt required' })
    const agent = agentManager.getAgent(req.params.id)
    if (!agent) return res.status(404).json({ error: 'Not found' })
    dbOps.savePrompt(req.params.id, prompt)
    agentManager.sendPrompt(req.params.id, prompt)
    res.json({ ok: true })
  })

  // POST /api/agents/:id/stdin — write to running process stdin (safe mode confirmations)
  app.post('/api/agents/:id/stdin', (req, res) => {
    const { input } = req.body as { input: string }
    if (input === undefined) return res.status(400).json({ error: 'input required' })
    const ok = agentManager.writeStdin(req.params.id, input)
    res.json({ ok })
  })

  // PATCH /api/agents/:id/safe-mode — toggle safe mode without full edit
  app.patch('/api/agents/:id/safe-mode', (req, res) => {
    const { safeMode } = req.body as { safeMode: boolean }
    const agent = agentManager.getAgent(req.params.id)
    if (!agent) return res.status(404).json({ error: 'Not found' })
    const updated = agentManager.updateAgent(req.params.id, { safeMode })
    if (updated) dbOps.updateAgent(updated.id, updated.name, updated.workingDir, updated.safeMode)
    res.json(updated)
  })

  // POST /api/agents/:id/stop
  app.post('/api/agents/:id/stop', (req, res) => {
    agentManager.stopAgent(req.params.id)
    res.json({ ok: true })
  })

  // GET /api/agents/:id/history
  app.get('/api/agents/:id/history', (req, res) => {
    const history = dbOps.getHistory(req.params.id)
    res.json(history)
  })

  const httpServer = http.createServer(app)
  httpServer.listen(PORT_HTTP, () => {
    console.log(`[server] HTTP listening on :${PORT_HTTP}`)
  })

  // ── WebSocket server ──────────────────────────────────────────────
  const wss = new WebSocketServer({ port: PORT_WS })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', `http://localhost`)
    const agentId = url.searchParams.get('agentId')
    if (!agentId) {
      ws.close(1008, 'agentId required')
      return
    }

    if (!subscribers.has(agentId)) subscribers.set(agentId, new Set())
    subscribers.get(agentId)!.add(ws)

    const agent = agentManager.getAgent(agentId)
    if (agent) {
      ws.send(JSON.stringify({ type: 'status', status: agent.status }))
    }

    ws.on('close', () => {
      subscribers.get(agentId)?.delete(ws)
    })
  })

  console.log(`[server] WebSocket listening on :${PORT_WS}`)
}
