#!/usr/bin/env node
/**
 * Test Runner
 *
 * Starts the server with MOCK_MODE=true and runs E2E tests.
 *
 * Usage: npm run test:e2e
 */

import { spawn, exec } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('╔════════════════════════════════════════════════════╗');
console.log('║           E2E Test Runner                          ║');
console.log('║  External mocks: Groq, Whisper, KV                 ║');
console.log('║  Real: All internal logic                          ║');
console.log('╚════════════════════════════════════════════════════╝\n');

async function killPort(port) {
  return new Promise((resolve) => {
    // Windows
    if (process.platform === 'win32') {
      exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
        if (stdout) {
          const lines = stdout.trim().split('\n');
          const pids = new Set();
          lines.forEach(line => {
            const match = line.match(/\s+(\d+)$/);
            if (match) pids.add(match[1]);
          });
          pids.forEach(pid => {
            exec(`taskkill /PID ${pid} /F`, () => {});
          });
        }
        resolve();
      });
    } else {
      // Unix
      exec(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, () => resolve());
    }
  });
}

async function waitForServer(url, maxAttempts = 30) {
  const http = await import('http');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get(url, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        }).on('error', reject);
      });
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

async function run() {
  const PORT = 3000;

  // 1. Kill any existing process on port
  console.log(`[1/4] Cleaning up port ${PORT}...`);
  await killPort(PORT);
  await sleep(1000);

  // 2. Start server with MOCK_MODE
  console.log('[2/4] Starting server with MOCK_MODE=true...');
  const server = spawn('npx', ['vercel', 'dev', '--listen', String(PORT)], {
    cwd: projectRoot,
    env: { ...process.env, MOCK_MODE: 'true' },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  server.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  server.stderr.on('data', (data) => {
    serverOutput += data.toString();
  });

  // 3. Wait for server to be ready
  console.log('[3/4] Waiting for server...');
  const ready = await waitForServer(`http://localhost:${PORT}/`);

  if (!ready) {
    console.error('Server failed to start. Output:');
    console.error(serverOutput.slice(-1000));
    server.kill();
    process.exit(1);
  }

  console.log('       Server ready!\n');

  // 4. Run tests
  console.log('[4/4] Running E2E tests...\n');

  const tests = spawn('node', ['test/e2e.test.mjs'], {
    cwd: projectRoot,
    env: { ...process.env, MOCK_MODE: 'true' },
    stdio: 'inherit'
  });

  tests.on('close', (code) => {
    // Cleanup
    server.kill();
    process.exit(code);
  });

  // Handle interrupts
  process.on('SIGINT', () => {
    server.kill();
    process.exit(1);
  });
}

run().catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});
