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
    safe_mode INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`)

// Migrate existing DBs that don't have safe_mode column yet
try {
  db.exec(`ALTER TABLE agents ADD COLUMN safe_mode INTEGER NOT NULL DEFAULT 0`)
} catch { /* column already exists */ }

export interface AgentRow {
  id: string
  name: string
  working_dir: string
  safe_mode: number
  created_at: number
}

export const dbOps = {
  saveAgent(id: string, name: string, workingDir: string, safeMode: boolean, createdAt: number) {
    db.prepare('INSERT OR REPLACE INTO agents (id, name, working_dir, safe_mode, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id, name, workingDir, safeMode ? 1 : 0, createdAt
    )
  },

  updateAgent(id: string, name: string, workingDir: string, safeMode: boolean) {
    db.prepare('UPDATE agents SET name = ?, working_dir = ?, safe_mode = ? WHERE id = ?').run(
      name, workingDir, safeMode ? 1 : 0, id
    )
  },

  deleteAgent(id: string) {
    db.prepare('DELETE FROM agents WHERE id = ?').run(id)
    db.prepare('DELETE FROM history WHERE agent_id = ?').run(id)
  },

  getAllAgents(): AgentRow[] {
    return db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all() as AgentRow[]
  },

  savePrompt(agentId: string, prompt: string) {
    db.prepare('INSERT INTO history (agent_id, prompt, created_at) VALUES (?, ?, ?)').run(
      agentId, prompt, Date.now()
    )
  },

  getHistory(agentId: string, limit = 50): { prompt: string; created_at: number }[] {
    return db
      .prepare('SELECT prompt, created_at FROM history WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(agentId, limit) as { prompt: string; created_at: number }[]
  },
}
