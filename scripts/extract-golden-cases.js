#!/usr/bin/env node

/**
 * Golden Case Extraction Tool
 *
 * Extract notable turns from conversations and create golden case files
 * Usage:
 *   node scripts/extract-golden-cases.js --input <transcript.json> --persona <name>
 *
 * Workflow:
 *   1. Load conversation transcript (from Playwright output or exported KV data)
 *   2. Display each turn with metadata
 *   3. Ask user which turns are notable
 *   4. Create golden case JSON files
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const GOLDEN_CASES_DIR = './golden-cases';

// Ensure golden-cases directory exists
fs.mkdirSync(GOLDEN_CASES_DIR, { recursive: true });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function analyzeTranscript(transcript) {
  console.log('\n' + '='.repeat(80));
  console.log('GOLDEN CASE EXTRACTION');
  console.log('='.repeat(80));
  console.log(`\nAnalyzing transcript: ${transcript.turns.length} turns`);
  console.log(`Persona: ${transcript.persona || 'unknown'}\n`);

  const goldenCases = [];

  for (let i = 0; i < transcript.turns.length; i++) {
    const turn = transcript.turns[i];

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`TURN ${i + 1} / ${transcript.turns.length}`);
    console.log('─'.repeat(80));

    console.log(`\nUser: "${turn.userMessage}"`);
    console.log(`\nAI: "${turn.response}"`);

    if (turn.speechAct || turn.dialogueAct) {
      console.log(`\nMetadata:`);
      console.log(`  Speech Act: ${turn.speechAct}`);
      console.log(`  Dialogue Act: ${turn.dialogueAct}`);
      if (turn.fitScore !== null) {
        console.log(`  Fit Score: ${turn.fitScore}`);
      }
    }

    console.log('\nIs this a notable turn? (y/n/q to quit)');
    const answer = await question('> ').catch(() => 'n');

    if (answer.toLowerCase() === 'q') {
      console.log('\nExtraction aborted.');
      break;
    }

    if (answer.toLowerCase() === 'y') {
      // Get details for golden case
      console.log('\nGolden Case Details:');

      const name = await question('  Brief name for this case: ');
      const context = await question('  Why is this notable? ');
      const expectedDialogueAct = await question(
        '  Expected dialogue act (or press Enter for: ' + (turn.dialogueAct || 'probe_deeper') + '): '
      );
      const expectedTier = await question('  Expected tier (A/B/C, default A): ');

      const goldenCase = {
        name: name || `Turn ${i + 1} - ${transcript.persona}`,
        source: {
          persona: transcript.persona || 'unknown',
          turnNumber: i + 1,
          context: context || 'Notable interaction'
        },
        userMessage: turn.userMessage,
        expected: {
          dialogueAct: expectedDialogueAct || turn.dialogueAct || 'probe_deeper',
          speechAct: turn.speechAct || 'directive',
          tier: expectedTier.toUpperCase() || 'A',
          reason: context,
          alternativeTiers: []
        },
        actual: {
          response: turn.response,
          dialogueAct: turn.dialogueAct,
          speechAct: turn.speechAct,
          tier: 'A',
          criteria: turn.criteria || [],
          rubricScores: turn.rubricScores || {
            'depth-of-questioning': null,
            'self-awareness': null,
            'systems-thinking': null,
            'experimentation-evidence': null,
            'authenticity': null,
            'reciprocal-curiosity': null
          },
          fitScore: turn.fitScore || null,
          timestamp: turn.timestamp
        },
        aiResponseQuality: {
          executionScore: null,
          executionNotes: '',
          regressionStatus: null
        },
        analysis: context
      };

      goldenCases.push(goldenCase);
      console.log(`✓ Added: ${goldenCase.name}`);
    }
  }

  return goldenCases;
}

function validateGoldenCase(gc) {
  // Basic schema validation
  const errors = [];

  if (!gc.name) errors.push('Missing name');
  if (!gc.source || !gc.source.persona || !gc.source.turnNumber) errors.push('Invalid source');
  if (!gc.userMessage) errors.push('Missing userMessage');
  if (!gc.expected || !gc.expected.dialogueAct || !gc.expected.speechAct || !gc.expected.tier) errors.push('Invalid expected');
  if (!gc.actual || !gc.actual.response) errors.push('Invalid actual');

  // Validate enums
  const validDialogueActs = ['open_with_question', 'probe_deeper', 'ask_for_concrete', 'validate_genuine', 'redirect_from_surface', 'reflect_understanding', 'affirm_commitment'];
  const validSpeechActs = ['assertive', 'directive', 'expressive', 'commissive', 'declarative'];
  const validTiers = ['A', 'B', 'C'];

  if (!validDialogueActs.includes(gc.expected.dialogueAct)) {
    errors.push(`Invalid dialogueAct: ${gc.expected.dialogueAct}`);
  }
  if (!validSpeechActs.includes(gc.expected.speechAct)) {
    errors.push(`Invalid speechAct: ${gc.expected.speechAct}`);
  }
  if (!validTiers.includes(gc.expected.tier)) {
    errors.push(`Invalid tier: ${gc.expected.tier}`);
  }

  return { valid: errors.length === 0, errors };
}

function saveGoldenCases(cases, persona) {
  const saved = [];

  cases.forEach((gc, idx) => {
    // Validate before saving
    const validation = validateGoldenCase(gc);
    if (!validation.valid) {
      console.warn(`⚠ Warning: Golden case ${idx + 1} has issues:`);
      validation.errors.forEach(err => console.warn(`  - ${err}`));
      console.warn('  Saving anyway...');
    }

    // Create filename from name or use default
    const filename = `${persona}-turn${gc.source.turnNumber}-${gc.name.toLowerCase().replace(/\s+/g, '-').substring(0, 30)}.json`;
    const filepath = path.join(GOLDEN_CASES_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(gc, null, 2));
    saved.push(filepath);
    console.log(`✓ Saved: ${filepath}`);
  });

  return saved;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputFile = null;
  let persona = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputFile = args[i + 1];
      i++;
    } else if (args[i] === '--persona' && args[i + 1]) {
      persona = args[i + 1];
      i++;
    }
  }

  if (!inputFile) {
    console.log(`Golden Case Extraction Tool

Usage:
  node scripts/extract-golden-cases.js --input <file> --persona <name>

Arguments:
  --input <file>      Path to transcript JSON (from Playwright or exported KV)
  --persona <name>    Persona name (e.g., philosophical-thinker)

Example:
  node scripts/extract-golden-cases.js --input ./playwright/transcripts/philosophical-thinker-transcript.json --persona philosophical-thinker

Interactive workflow:
  1. Shows each turn from the transcript
  2. You review and select notable turns
  3. You provide golden case details (name, context, expected behavior)
  4. Golden case JSON files are created in ./golden-cases/
`);
    return;
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

    // Handle different input formats
    const transcript = {
      persona: persona || data.persona || 'unknown',
      turns: data.turns || data
    };

    const goldenCases = await analyzeTranscript(transcript);

    if (goldenCases.length === 0) {
      console.log('\nNo golden cases extracted.');
      rl.close();
      return;
    }

    console.log(`\n\nExtracted ${goldenCases.length} golden case(s)`);
    console.log('Saving to ./golden-cases/...\n');

    const saved = saveGoldenCases(goldenCases, transcript.persona);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ EXTRACTION COMPLETE`);
    console.log('='.repeat(80));
    console.log(`\nSaved ${saved.length} golden case files:`);
    saved.forEach(f => console.log(`  • ${f}`));
    console.log('\nNext steps:');
    console.log('  1. Review golden case files');
    console.log('  2. Fill in aiResponseQuality scores');
    console.log('  3. Update expected.alternativeTiers if needed');
    console.log('  4. Use for regression testing when prompt changes');

    rl.close();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

main().catch(console.error);
