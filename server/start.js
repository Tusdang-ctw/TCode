#!/usr/bin/env node
// Bootstrap entry point for the Node.js backend server.
// Tauri spawns this file with: node server/start.js
// It uses tsx to run TypeScript directly without a separate compile step.
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// Register tsx for TypeScript support
require('tsx/cjs')

// Start the server
require(join(__dirname, 'index.ts'))
