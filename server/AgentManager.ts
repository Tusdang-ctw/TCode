import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export type AgentStatus = 'idle' | 'running' | 'error' | 'stopped'

export interface Agent {
  id: string
  name: string
  workingDir: string
  status: AgentStatus
  safeMode: boolean
  createdAt: number
}

interface AgentProcess {
  agent: Agent
  proc: ChildProcess | null
}

export class AgentManager extends EventEmitter {
  private agents: Map<string, AgentProcess> = new Map()

  createAgent(id: string, name: string, workingDir: string, safeMode = false): Agent {
    const agent: Agent = {
      id,
      name,
      workingDir,
      status: 'idle',
      safeMode,
      createdAt: Date.now(),
    }
    this.agents.set(id, { agent, proc: null })
    return agent
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id)?.agent
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values()).map((a) => a.agent)
  }

  removeAgent(id: string): void {
    this.stopAgent(id)
    this.agents.delete(id)
    this.emit('agent:removed', { agentId: id })
  }

  updateAgent(id: string, updates: Partial<Pick<Agent, 'name' | 'workingDir' | 'safeMode'>>): Agent | null {
    const entry = this.agents.get(id)
    if (!entry) return null
    Object.assign(entry.agent, updates)
    return entry.agent
  }

  sendPrompt(id: string, prompt: string): void {
    const entry = this.agents.get(id)
    if (!entry) {
      this.emit('agent:error', { agentId: id, data: 'Agent not found' })
      return
    }

    this.stopAgent(id)

    const { agent } = entry
    agent.status = 'running'
    this.emit('agent:status', { agentId: id, status: 'running' })

    const args = ['--print', '--output-format', 'stream-json']
    if (!agent.safeMode) {
      args.push('--dangerously-skip-permissions')
    }
    args.push(prompt)

    const proc = spawn('claude', args, {
      cwd: agent.workingDir,
      env: { ...process.env },
      shell: true,
      // Keep stdin open so we can write confirmation responses
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    entry.proc = proc

    let buffer = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const parsed = JSON.parse(trimmed)
          const text = extractText(parsed)
          if (text) {
            this.emit('agent:data', { agentId: id, data: text })
          } else {
            this.emit('agent:json', { agentId: id, data: parsed })
          }
        } catch {
          this.emit('agent:data', { agentId: id, data: trimmed + '\n' })
        }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      this.emit('agent:data', { agentId: id, data: text })
    })

    proc.on('close', (code) => {
      const status: AgentStatus = code === 0 ? 'idle' : 'error'
      if (this.agents.has(id)) {
        this.agents.get(id)!.agent.status = status
        this.agents.get(id)!.proc = null
        this.emit('agent:status', { agentId: id, status })
        this.emit('agent:done', { agentId: id, code })
      }
    })

    proc.on('error', (err) => {
      const msg = err.message.includes('ENOENT')
        ? `\r\n\x1b[31mError: 'claude' CLI not found. Make sure Claude Code is installed and in your PATH.\x1b[0m\r\n`
        : `\r\n\x1b[31mProcess error: ${err.message}\x1b[0m\r\n`
      this.emit('agent:data', { agentId: id, data: msg })
      if (this.agents.has(id)) {
        this.agents.get(id)!.agent.status = 'error'
        this.emit('agent:status', { agentId: id, status: 'error' })
      }
    })
  }

  // Write a line to the running process stdin (for safe mode confirmations)
  writeStdin(id: string, input: string): boolean {
    const entry = this.agents.get(id)
    if (!entry?.proc?.stdin) return false
    try {
      entry.proc.stdin.write(input + '\n')
      return true
    } catch {
      return false
    }
  }

  stopAgent(id: string): void {
    const entry = this.agents.get(id)
    if (!entry?.proc) return
    try {
      entry.proc.kill('SIGTERM')
    } catch {}
    entry.proc = null
    entry.agent.status = 'idle'
    this.emit('agent:status', { agentId: id, status: 'idle' })
  }
}

function extractText(parsed: Record<string, unknown>): string | null {
  if (parsed.type === 'assistant') {
    const msg = parsed.message as Record<string, unknown> | undefined
    if (!msg) return null
    const content = msg.content as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) return null
    return content
      .filter((c) => c.type === 'text')
      .map((c) => String(c.text ?? ''))
      .join('')
  }
  if (parsed.type === 'result') return null
  return null
}
