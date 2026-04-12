import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { WsMessage, AgentStatus } from '../types'
import { useAgentStore } from '../store/agentStore'

const WS_URL = 'ws://localhost:3132'

export function useAgentSocket(agentId: string, terminal: Terminal | null) {
  const setStatus = useAgentStore((s) => s.setStatus)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!terminal) return

    const connect = () => {
      const ws = new WebSocket(`${WS_URL}/?agentId=${agentId}`)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data as string)

          if (msg.type === 'data' && msg.data) {
            // Normalize line endings for xterm
            terminal.write(msg.data.replace(/\n/g, '\r\n'))
          } else if (msg.type === 'status' && msg.status) {
            setStatus(agentId, msg.status as AgentStatus)
            const colors: Record<string, string> = {
              running: '\x1b[33m',
              idle: '\x1b[32m',
              error: '\x1b[31m',
              stopped: '\x1b[90m',
            }
            const label = msg.status.toUpperCase()
            terminal.write(`\r\n${colors[msg.status] ?? ''}\x1b[2m── ${label} ──\x1b[0m\r\n`)
          } else if (msg.type === 'done') {
            const code = msg.code ?? 0
            const color = code === 0 ? '\x1b[32m' : '\x1b[31m'
            terminal.write(`\r\n${color}\x1b[2m── DONE (exit ${code}) ──\x1b[0m\r\n`)
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        // Reconnect after 2s if not intentionally closed
        setTimeout(() => {
          if (wsRef.current === ws) connect()
        }, 2000)
      }
    }

    connect()

    return () => {
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
    }
  }, [agentId, terminal, setStatus])

  return wsRef
}
