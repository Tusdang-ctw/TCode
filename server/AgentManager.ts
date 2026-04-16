import * as pty from 'node-pty'
import { EventEmitter } from 'events'
import * as os from 'os'
import * as fs from 'fs'

export interface Agent {
  id: string
  name: string
  workingDir: string
  command: string
  createdAt: number
}

interface PtyEntry {
  agent: Agent
  pty: pty.IPty | null
}

export class AgentManager extends EventEmitter {
  private agents: Map<string, PtyEntry> = new Map()

  private getShell(): string {
    if (os.platform() === 'win32') {
      // Prefer PowerShell 7 (pwsh), fall back to Windows PowerShell
      try {
        require('child_process').execSync('pwsh --version', { stdio: 'ignore' })
        return 'pwsh.exe'
      } catch {
        return 'powershell.exe'
      }
    }
    return process.env.SHELL || '/bin/bash'
  }

  createAgent(id: string, name: string, workingDir: string, command: string, createdAt?: number): Agent {
    const agent: Agent = {
      id,
      name,
      workingDir,
      command,
      createdAt: createdAt ?? Date.now(),
    }
    this.agents.set(id, { agent, pty: null })
    return agent
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id)?.agent
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values()).map((e) => e.agent)
  }

  updateAgent(id: string, updates: Partial<Pick<Agent, 'name' | 'workingDir' | 'command'>>): Agent | null {
    const entry = this.agents.get(id)
    if (!entry) return null
    Object.assign(entry.agent, updates)
    return entry.agent
  }

  spawnPty(id: string, cols = 80, rows = 24): void {
    const entry = this.agents.get(id)
    if (!entry) return
    if (entry.pty) return // already alive

    // Validate working directory exists before spawning
    const cwd = entry.agent.workingDir
    if (!fs.existsSync(cwd)) {
      this.emit('pty:error', {
        agentId: id,
        error: `Working directory does not exist: ${cwd}`,
      })
      return
    }

    const shell = this.getShell()

    let p: pty.IPty
    try {
      p = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: process.env as Record<string, string>,
      })
    } catch (err) {
      this.emit('pty:error', {
        agentId: id,
        error: `Failed to spawn terminal: ${err}`,
      })
      return
    }

    entry.pty = p

    p.onData((data: string) => {
      this.emit('pty:data', { agentId: id, data })
    })

    p.onExit(({ exitCode, signal }) => {
      if (this.agents.has(id)) {
        this.agents.get(id)!.pty = null
      }
      this.emit('pty:exit', { agentId: id, exitCode, signal })
    })

    // Send startup command after shell is ready.
    // Use 500ms delay — shells on Windows (pwsh) need time to initialize.
    if (entry.agent.command) {
      const cmd = entry.agent.command
      setTimeout(() => {
        if (entry.pty === p) {
          p.write(cmd + '\r')
        }
      }, 500)
    }
  }

  /** Kill and respawn the PTY for an agent. */
  restartPty(id: string, cols = 80, rows = 24): void {
    this.killPty(id)
    this.spawnPty(id, cols, rows)
  }

  write(id: string, data: string): void {
    this.agents.get(id)?.pty?.write(data)
  }

  resizePty(id: string, cols: number, rows: number): void {
    const entry = this.agents.get(id)
    if (!entry?.pty) return
    try {
      entry.pty.resize(cols, rows)
    } catch {
      // Ignore resize errors (e.g. if PTY already exited)
    }
  }

  isPtyAlive(id: string): boolean {
    return this.agents.get(id)?.pty != null
  }

  killPty(id: string): void {
    const entry = this.agents.get(id)
    if (!entry?.pty) return
    try {
      entry.pty.kill()
    } catch {
      // Ignore kill errors (process may already be dead)
    }
    entry.pty = null
  }

  removeAgent(id: string): void {
    this.killPty(id)
    this.agents.delete(id)
    this.emit('agent:removed', { agentId: id })
  }
}
