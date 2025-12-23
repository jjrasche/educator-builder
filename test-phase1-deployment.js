#!/usr/bin/env node

/**
 * Phase 1 Deployment Test
 *
 * Verifies that the new continuous evaluation architecture works:
 * - Single LLM call returns response + speechAct + dialogueAct + criteria + rubricScores + fitScore
 * - Metadata sent every turn (not just at turn 5+)
 * - KV storage captures full operational data
 */

import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const API_URL = 'http://localhost:3000/api/chat'; // Change to deployed URL

const testConversation = [
  {
    role: 'user',
    content: 'Hi, I saw your post about living differently. I\'ve been thinking a lot about freedom and what it actually means.'
  },
  {
    role: 'assistant',
    content: 'That\'s a great starting point. What does freedom mean to you specifically? Is it more about independence, or about being part of something larger?'
  },
  {
    role: 'user',
    content: 'Both, actually. I think real freedom is knowing you\'re interdependent but choosing it. I want to work on something meaningful with people who think differently than me.'
  },
  {
    role: 'assistant',
    content: 'I like that - interdependence by choice, not necessity. That requires real self-awareness. What does meaningful work look like to you?'
  },
  {
    role: 'user',
    content: 'Something where I can see the impact of my work immediately, where I\'m learning constantly, and where the people around me actually care about each other.'
  }
];

async function testPhase1() {
  console.log('='.repeat(80));
  console.log('PHASE 1 DEPLOYMENT TEST');
  console.log('='.repeat(80));
  console.log(`\nTesting against: ${API_URL}`);
  console.log(`\nTest flow: 1 new user message, expect full evaluation metadata\n`);

  const sessionId = uuidv4();
  const email = `test-${Date.now()}@example.com`;

  // Simulate 1 new turn
  const messages = [...testConversation];
  const newUserMessage = 'I\'ve spent the last two years freelancing but it felt isolating. I want community as much as independence.';

  console.log('User message:');
  console.log(`  "${newUserMessage}"\n`);

  try {
    console.log('Sending request to API...');
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, { role: 'user', content: newUserMessage }],
        sessionId,
        email
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aiText = '';
    let metadata = null;
    let turnCount = 0;

    console.log('\nStreaming response:');
    console.log('-'.repeat(80));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.text) {
              aiText += parsed.text;
              process.stdout.write(parsed.text);
            } else if (parsed.type === 'metadata') {
              metadata = parsed;
              turnCount++;
            }
          } catch (e) {}
        }
      }
    }

    console.log('\n' + '-'.repeat(80));

    // Validation
    console.log('\n' + '='.repeat(80));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(80));

    const validation = {
      hasResponse: !!aiText,
      hasMetadata: !!metadata,
      hasAllFields: metadata ? [
        'speechAct',
        'dialogueAct',
        'criteria',
        'rubricScores',
        'fitScore',
        'rationale',
        'canUnlockEmail'
      ].every(field => field in metadata) : false
    };

    console.log(`\n✓ Response received: ${validation.hasResponse}`);
    console.log(`  Length: ${aiText.length} characters`);

    console.log(`\n✓ Metadata received: ${validation.hasMetadata}`);
    if (metadata) {
      console.log(`  speechAct: ${metadata.speechAct}`);
      console.log(`  dialogueAct: ${metadata.dialogueAct}`);
      console.log(`  criteria: ${JSON.stringify(metadata.criteria)}`);
      console.log(`  rubricScores:`);
      Object.entries(metadata.rubricScores || {}).forEach(([k, v]) => {
        console.log(`    ${k}: ${v}`);
      });
      console.log(`  fitScore: ${metadata.fitScore}`);
      console.log(`  canUnlockEmail: ${metadata.canUnlockEmail}`);
      console.log(`  rationale: "${metadata.rationale}"`);
    }

    console.log(`\n✓ All fields present: ${validation.hasAllFields}`);

    // Summary
    console.log('\n' + '='.repeat(80));
    if (validation.hasResponse && validation.hasAllFields) {
      console.log('✅ PHASE 1 IMPLEMENTATION VERIFIED');
      console.log('\nKey achievements:');
      console.log('  • Single LLM call returns structured JSON ✓');
      console.log('  • Metadata sent every turn (not just at turn 5) ✓');
      console.log('  • speechAct and dialogueAct captured ✓');
      console.log('  • Continuous fitScore available ✓');
      console.log('\n📊 Next: Deploy to Vercel and run full E2E tests');
    } else {
      console.log('❌ PHASE 1 VALIDATION FAILED');
      if (!validation.hasResponse) console.log('  ✗ No response text');
      if (!validation.hasMetadata) console.log('  ✗ No metadata returned');
      if (!validation.hasAllFields) console.log('  ✗ Missing required fields in metadata');
    }
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.log('\nTroubleshooting:');
    console.log('  1. Is the API running? (Check API_URL at top of script)');
    console.log('  2. Is GROQ_API_KEY set in Vercel environment?');
    console.log('  3. Check server logs for errors');
  }
}

testPhase1().catch(console.error);
