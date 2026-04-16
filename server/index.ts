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

/** Send a JSON control message to all subscribers of an agent. */
function broadcast(agentId: string, msg: object) {
  const clients = subscribers.get(agentId)
  if (!clients) return
  const json = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(json)
  }
}

// Pipe raw PTY output to all subscribed WebSocket clients
agentManager.on('pty:data', ({ agentId, data }) => {
  const clients = subscribers.get(agentId)
  if (!clients) return
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data)
  }
})

agentManager.on('pty:exit', ({ agentId, exitCode }) => {
  broadcast(agentId, { type: 'exit', exitCode })
  broadcast(agentId, { type: 'status', alive: false })
})

// Send spawn errors to the terminal as visible red text
agentManager.on('pty:error', ({ agentId, error }) => {
  console.error(`[pty:error] Agent ${agentId}: ${error}`)
  const msg = `\r\n\x1b[31m[Error: ${error}]\x1b[0m\r\n`
  const clients = subscribers.get(agentId)
  if (!clients) return
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  }
  broadcast(agentId, { type: 'status', alive: false })
})

agentManager.on('agent:removed', ({ agentId }) => {
  subscribers.delete(agentId)
})

// Prevent the server from crashing on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception (server kept alive):', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled rejection (server kept alive):', err)
})

// Graceful shutdown: kill all PTY processes before exiting
function shutdown() {
  console.log('[server] Shutting down...')
  for (const agent of agentManager.getAllAgents()) {
    agentManager.killPty(agent.id)
  }
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export async function startServer(): Promise<void> {
  // Restore agents from DB
  const saved = dbOps.getAllAgents()
  for (const row of saved) {
    agentManager.createAgent(row.id, row.name, row.working_dir, row.command, row.created_at)
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
  app.options('*splat', (_req, res) => res.sendStatus(200))

  // GET /api/agents — list all agents with PTY alive status
  app.get('/api/agents', (_req, res) => {
    try {
      const agents = agentManager.getAllAgents().map((a) => ({
        ...a,
        ptyAlive: agentManager.isPtyAlive(a.id),
      }))
      res.json(agents)
    } catch (e) { res.status(500).json({ error: String(e) }) }
  })

  // POST /api/agents — create agent
  app.post('/api/agents', (req, res) => {
    try {
      const { name, workingDir, command } = req.body as { name: string; workingDir: string; command?: string }
      if (!name || !workingDir) return res.status(400).json({ error: 'name and workingDir required' })
      const id = randomUUID()
      const cmd = command ?? ''
      const agent = agentManager.createAgent(id, name, workingDir, cmd)
      dbOps.saveAgent(id, name, workingDir, cmd, agent.createdAt)
      res.json({ ...agent, ptyAlive: false })
    } catch (e) { res.status(500).json({ error: String(e) }) }
  })

  // PUT /api/agents/:id — update name/workingDir/command
  app.put('/api/agents/:id', (req, res) => {
    try {
      const { name, workingDir, command } = req.body as { name?: string; workingDir?: string; command?: string }
      const agent = agentManager.getAgent(req.params.id)
      if (!agent) return res.status(404).json({ error: 'Not found' })
      const updated = agentManager.updateAgent(req.params.id, {
        name: name ?? agent.name,
        workingDir: workingDir ?? agent.workingDir,
        command: command ?? agent.command,
      })
      if (updated) dbOps.updateAgent(updated.id, updated.name, updated.workingDir, updated.command)
      res.json({ ...updated, ptyAlive: agentManager.isPtyAlive(req.params.id) })
    } catch (e) { res.status(500).json({ error: String(e) }) }
  })

  // DELETE /api/agents/:id
  app.delete('/api/agents/:id', (req, res) => {
    try {
      agentManager.removeAgent(req.params.id)
      dbOps.deleteAgent(req.params.id)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: String(e) }) }
  })

  // POST /api/agents/:id/stop — kill the PTY without deleting the agent
  app.post('/api/agents/:id/stop', (req, res) => {
    try {
      const agent = agentManager.getAgent(req.params.id)
      if (!agent) return res.status(404).json({ error: 'Not found' })
      agentManager.killPty(req.params.id)
      res.json({ ok: true, ptyAlive: false })
    } catch (e) { res.status(500).json({ error: String(e) }) }
  })

  // POST /api/agents/:id/restart — kill + respawn PTY
  app.post('/api/agents/:id/restart', (req, res) => {
    try {
      const agent = agentManager.getAgent(req.params.id)
      if (!agent) return res.status(404).json({ error: 'Not found' })
      const { cols, rows } = req.body as { cols?: number; rows?: number }
      agentManager.restartPty(req.params.id, cols ?? 80, rows ?? 24)
      const alive = agentManager.isPtyAlive(req.params.id)
      broadcast(req.params.id, { type: 'status', alive })
      res.json({ ok: true, ptyAlive: alive })
    } catch (e) { res.status(500).json({ error: String(e) }) }
  })

  // ── Start HTTP server with port conflict detection ────────────────
  const httpServer = http.createServer(app)

  httpServer.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT_HTTP} already in use. Is another instance of TCode running?`)
      process.exit(1)
    }
    throw e
  })

  httpServer.listen(PORT_HTTP, () => {
    console.log(`[server] HTTP listening on :${PORT_HTTP}`)
  })

  // ── WebSocket server with port conflict detection ─────────────────
  const wss = new WebSocketServer({ port: PORT_WS })

  wss.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[server] WebSocket port ${PORT_WS} already in use. Is another instance of TCode running?`)
      process.exit(1)
    }
    throw e
  })

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost`)
      const agentId = url.searchParams.get('agentId')
      if (!agentId) {
        ws.close(1008, 'agentId required')
        return
      }

      // Validate agent exists
      if (!agentManager.getAgent(agentId)) {
        ws.close(1008, 'Agent not found')
        return
      }

      const cols = parseInt(url.searchParams.get('cols') ?? '80', 10)
      const rows = parseInt(url.searchParams.get('rows') ?? '24', 10)

      // Subscribe this client
      if (!subscribers.has(agentId)) subscribers.set(agentId, new Set())
      subscribers.get(agentId)!.add(ws)

      // Spawn PTY if not already alive (spawnPty handles errors internally)
      agentManager.spawnPty(agentId, cols, rows)

      // Send initial status so the client knows the PTY state
      ws.send(JSON.stringify({ type: 'status', alive: agentManager.isPtyAlive(agentId) }))

      // Handle incoming messages from client
      ws.on('message', (raw: Buffer | string) => {
        const str = raw.toString()
        try {
          const msg = JSON.parse(str)
          if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
            agentManager.resizePty(agentId, msg.cols, msg.rows)
            return
          }
        } catch {
          // Not JSON — treat as raw terminal input
        }
        agentManager.write(agentId, str)
      })

      ws.on('close', () => {
        subscribers.get(agentId)?.delete(ws)
      })
    } catch (err) {
      console.error('[server] WebSocket connection handler error:', err)
      try { ws.close(1011, 'Internal error') } catch { /* ignore */ }
    }
  })

  console.log(`[server] WebSocket listening on :${PORT_WS}`)
}

// Auto-invoke on module load
startServer().catch((err) => {
  console.error('[server] Fatal startup error:', err)
  process.exit(1)
})
