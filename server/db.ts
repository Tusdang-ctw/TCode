import Database from 'better-sqlite3'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const DATA_DIR = path.join(os.homedir(), '.tcode')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = path.join(DATA_DIR, 'sessions.db')
const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    working_dir TEXT NOT NULL,
    command TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
`)

// Migrate: add command column if missing (existing databases)
try {
  db.exec(`ALTER TABLE agents ADD COLUMN command TEXT NOT NULL DEFAULT ''`)
} catch {
  // Column already exists — ignore
}

export interface AgentRow {
  id: string
  name: string
  working_dir: string
  command: string
  created_at: number
}

export const dbOps = {
  saveAgent(id: string, name: string, workingDir: string, command: string, createdAt: number) {
    db.prepare('INSERT OR REPLACE INTO agents (id, name, working_dir, command, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id, name, workingDir, command, createdAt
    )
  },

  updateAgent(id: string, name: string, workingDir: string, command: string) {
    db.prepare('UPDATE agents SET name = ?, working_dir = ?, command = ? WHERE id = ?').run(
      name, workingDir, command, id
    )
  },

  deleteAgent(id: string) {
    db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  },

  getAllAgents(): AgentRow[] {
    return db.prepare('SELECT id, name, working_dir, command, created_at FROM agents ORDER BY created_at ASC').all() as AgentRow[]
  },
}
