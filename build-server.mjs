// Builds the Node.js backend server into a single CJS bundle.
// Output: dist-server/server.js
// Run: node build-server.mjs
import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist-server/server.js',
  external: [
    // Native addons must be kept external
    'better-sqlite3',
  ],
  sourcemap: process.env.NODE_ENV !== 'production',
})

console.log('Server bundle written to dist-server/server.js')
