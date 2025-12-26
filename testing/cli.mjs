#!/usr/bin/env node

/**
 * Persona Generation CLI
 * Standard interface for generating synthetic conversations
 *
 * Usage:
 *   node testing/cli.mjs run-personas --personas philosophical-thinker --runs 2
 *   node testing/cli.mjs run-personas --all
 *   node testing/cli.mjs status
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Load environment from .env.local
function loadEnv() {
  const envPath = path.join(projectRoot, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('✗ .env.local not found. Please create it with API keys.');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, ...valueParts] = line.split('=');
    process.env[key.trim()] = valueParts.join('=').replace(/^["']|["']$/g, '');
  }

  const required = ['GROQ_API_KEY', 'DATABASE_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`✗ Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('✓ Environment loaded');
}

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  return {
    command: args[0],
    flags: args.slice(1).reduce((acc, arg) => {
      if (arg.startsWith('--')) {
        const [key, val] = arg.slice(2).split('=');
        acc[key] = val || true;
      }
      return acc;
    }, {})
  };
}

function showHelp() {
  console.log(`
Persona Generation CLI
======================

Usage:
  node testing/cli.mjs run-personas [options]
  node testing/cli.mjs status

Options:
  --personas <name>    Run specific persona(s) (comma-separated)
  --runs <n>          Runs per persona (default: 5)
  --all               Run all personas (default)

Examples:
  node testing/cli.mjs run-personas --all
  node testing/cli.mjs run-personas --personas philosophical-thinker --runs 2
  node testing/cli.mjs status
`);
}

async function runPersonas(flags) {
  // Import the main runner
  const { spawn } = await import('child_process');

  const runScript = path.join(__dirname, 'run-personas.mjs');
  const logFile = path.join(__dirname, `persona-run-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  console.log(`\n📊 Starting persona generation`);
  console.log(`   Output: ${logFile}`);
  console.log(`   Runs per persona: ${flags.runs || 5}`);
  console.log('');

  const child = spawn('node', [runScript], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Stream output to both stdout and file
  child.stdout.pipe(logStream);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(logStream);
  child.stderr.pipe(process.stderr);

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      logStream.end();
      if (code === 0) {
        console.log(`\n✓ Persona generation complete`);
        console.log(`   Results: ${logFile}`);
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function showStatus() {
  const logDir = __dirname;
  const logs = fs.readdirSync(logDir)
    .filter(f => f.startsWith('persona-run-') && f.endsWith('.log'))
    .sort((a, b) => parseInt(b.match(/\d+/)[0]) - parseInt(a.match(/\d+/)[0]))
    .slice(0, 5);

  if (logs.length === 0) {
    console.log('No persona runs yet.');
    return;
  }

  console.log('\nRecent Persona Runs:\n');
  for (const log of logs) {
    const filePath = path.join(logDir, log);
    const stat = fs.statSync(filePath);
    const time = stat.mtime.toLocaleString();
    const size = (stat.size / 1024).toFixed(1);

    // Extract summary from log
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/SUMMARY[\s\S]*?avg=([0-9.]+)/);
    const avgScore = match ? match[1] : 'N/A';

    console.log(`  ${log}`);
    console.log(`    Time: ${time}`);
    console.log(`    Size: ${size}KB`);
    console.log(`    Avg Score: ${avgScore}`);
    console.log('');
  }
}

// Main
async function main() {
  loadEnv();

  const { command, flags } = parseArgs();

  try {
    switch (command) {
      case 'run-personas':
        await runPersonas(flags);
        break;
      case 'status':
        showStatus();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}

main();
