#!/usr/bin/env node

/**
 * KV Query Tool
 *
 * Retrieves conversation data from Vercel KV
 * Usage:
 *   node scripts/query-kv.js --session <sessionId>
 *   node scripts/query-kv.js --email <email>
 *   node scripts/query-kv.js --stats
 */

import { kv } from '@vercel/kv';
import fs from 'fs';

const args = process.argv.slice(2);

async function querySessions(filter) {
  try {
    if (filter.session) {
      // Query by session ID
      const key = `conversation:${filter.session}`;
      const data = await kv.get(key);

      if (!data) {
        console.log(`No data found for session: ${filter.session}`);
        return;
      }

      const metadata = await kv.get(`metadata:${filter.session}`);

      return {
        sessionId: filter.session,
        metadata,
        turns: Array.isArray(data) ? data : [data]
      };
    }

    if (filter.email) {
      // Query by email to get session ID
      const sessionId = await kv.get(`email:${filter.email}`);

      if (!sessionId) {
        console.log(`No session found for email: ${filter.email}`);
        return;
      }

      const key = `conversation:${sessionId}`;
      const data = await kv.get(key);
      const metadata = await kv.get(`metadata:${sessionId}`);

      return {
        sessionId,
        metadata,
        turns: Array.isArray(data) ? data : [data]
      };
    }

    if (filter.stats) {
      // Get statistics about stored conversations
      console.log('KV Storage Statistics:');
      console.log('(Note: KV doesn\'t support scan/keys, so this is limited)');
      console.log('Use --session or --email to retrieve specific conversations');
      return;
    }
  } catch (error) {
    console.error('KV query failed:', error.message);
    throw error;
  }
}

function formatOutput(data) {
  if (!data) return;

  console.log('\n' + '='.repeat(80));
  console.log(`SESSION: ${data.sessionId}`);
  console.log('='.repeat(80));

  if (data.metadata) {
    console.log('\nMETADATA:');
    console.log(`  Email: ${data.metadata.email || 'N/A'}`);
    console.log(`  Turn count: ${data.metadata.turnCount}`);
    console.log(`  Last fit score: ${data.metadata.lastFitScore}`);
    console.log(`  Started: ${data.metadata.startedAt}`);
    console.log(`  Last evaluated: ${data.metadata.lastEvaluated}`);
  }

  console.log(`\nTURNS: ${data.turns.length}`);
  console.log('-'.repeat(80));

  data.turns.forEach((turn, idx) => {
    console.log(`\nTURN ${idx + 1}:`);
    console.log(`  User: "${turn.userMessage.substring(0, 80)}${turn.userMessage.length > 80 ? '...' : ''}"`);
    console.log(`  Response: "${turn.response.substring(0, 80)}${turn.response.length > 80 ? '...' : ''}"`);
    console.log(`  Speech Act: ${turn.speechAct}`);
    console.log(`  Dialogue Act: ${turn.dialogueAct}`);
    console.log(`  Criteria: ${turn.criteria.join(', ') || 'none'}`);
    console.log(`  Fit Score: ${turn.fitScore !== null ? turn.fitScore : 'null'}`);
    if (turn.rubricScores) {
      console.log(`  Rubric Scores:`);
      Object.entries(turn.rubricScores).forEach(([k, v]) => {
        console.log(`    ${k}: ${v !== null ? v : 'null'}`);
      });
    }
    console.log(`  Timestamp: ${turn.timestamp}`);
  });

  console.log('\n' + '='.repeat(80));
}

function exportJSON(data, filename) {
  if (!data) return;

  const output = {
    sessionId: data.sessionId,
    metadata: data.metadata,
    turnCount: data.turns.length,
    turns: data.turns
  };

  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`\n✓ Exported to ${filename}`);
}

async function main() {
  // Parse arguments
  const filter = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session' && args[i + 1]) {
      filter.session = args[i + 1];
      i++;
    } else if (args[i] === '--email' && args[i + 1]) {
      filter.email = args[i + 1];
      i++;
    } else if (args[i] === '--stats') {
      filter.stats = true;
    } else if (args[i] === '--export' && args[i + 1]) {
      filter.export = args[i + 1];
      i++;
    }
  }

  if (!filter.session && !filter.email && !filter.stats) {
    console.log(`KV Query Tool

Usage:
  node scripts/query-kv.js --session <sessionId>          Query by session ID
  node scripts/query-kv.js --email <email>                Query by email
  node scripts/query-kv.js --stats                        Show statistics
  node scripts/query-kv.js --session <id> --export <file> Export to JSON

Examples:
  node scripts/query-kv.js --session abc123def456
  node scripts/query-kv.js --email user@example.com --export transcript.json
  node scripts/query-kv.js --stats
`);
    return;
  }

  try {
    const data = await querySessions(filter);

    if (data) {
      formatOutput(data);

      if (filter.export) {
        exportJSON(data, filter.export);
      }
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
