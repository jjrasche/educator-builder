import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const RESULTS_DIR = './playwright/persona-results';

fs.mkdirSync(RESULTS_DIR, { recursive: true });

test('PERSONA: Philosophical Thinker - Multi-turn evaluation', async ({ page }, testInfo) => {
  testInfo.setTimeout(180000); // 3 minutes timeout
  const persona = 'philosophical-thinker';
  const results = {
    persona,
    startTime: new Date().toISOString(),
    turns: [],
    sessionId: null,
    summary: {}
  };

  console.log('\n' + '='.repeat(100));
  console.log(`PERSONA TEST: ${persona.toUpperCase()}`);
  console.log('='.repeat(100));
  console.log('\nProfile: Deep thinker, interested in freedom/community, genuine, asks good questions');
  console.log('Expected: High scores on depth, self-awareness, systems-thinking, authenticity');
  console.log('Expected email unlock: YES (if fitScore >= 60 AND all floors pass)\n');

  // 1. Navigate to site
  console.log('[SETUP] Loading site...');
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
  console.log('✓ Site loaded\n');

  // Get input field
  const input = page.locator('input[type="text"]').first();
  const visible = await input.isVisible({ timeout: 3000 });
  if (!visible) {
    throw new Error('❌ Input field not found');
  }
  console.log('✓ Input field found\n');

  // ========== TURN 1: Opening ==========
  console.log('─'.repeat(100));
  console.log('TURN 1: Opening Inquiry');
  console.log('─'.repeat(100));

  const turn1Message = "I've been reading about alternative ways of living and working, and I'm curious—what drew you to create something like this? What's the core thing you're trying to figure out?";
  console.log(`\n[${persona}]: "${turn1Message}"\n`);

  await input.fill(turn1Message);
  await input.press('Enter');
  console.log('→ Message sent, waiting for response...\n');

  // Wait for response
  try {
    await page.waitForFunction(() => {
      const chatDiv = document.getElementById('chat-messages');
      return chatDiv && chatDiv.querySelectorAll('div').length > 2;
    }, { timeout: 10000 });
  } catch (e) {
    console.warn('⚠ Timeout waiting for response DOM');
  }

  // Wait for actual response text to appear (reactive - not just timing out)
  let response1 = '';
  try {
    // Wait until response has actual content (not just typing indicator)
    await page.waitForFunction(() => {
      const text = document.getElementById('chat-messages').innerText || '';
      // Check for response longer than just the user message (which is ~170 chars)
      const lines = text.split('\n');
      return lines.length > 5; // Multiple lines indicate guide response appeared
    }, { timeout: 15000 });

    // Now extract the response
    const chatText = await page.locator('#chat-messages').innerText();
    const parts = chatText.split('\nAI\n');
    if (parts.length > 1) {
      response1 = parts[parts.length - 1].split('\nYou\n')[0].trim();
    }
    if (!response1 || response1.length < 100) {
      // Fallback: get last substantial message block
      const messages1 = chatText.split(/\n{2,}/).filter(m => m.trim().length > 100);
      response1 = messages1[messages1.length - 1] || '';
    }
  } catch (e) {
    console.warn('⚠ Response extraction failed:', e.message);
  }

  console.log(`[Guide]: "${response1.substring(0, 200)}${response1.length > 200 ? '...' : ''}"\n`);
  console.log(`Response length: ${response1.length} characters\n`);

  // Extract metadata
  let metadata1 = null;
  try {
    const metadataEl = await page.locator('[data-metadata]').last();
    const metadataAttr = await metadataEl.getAttribute('data-metadata');
    if (metadataAttr) {
      metadata1 = JSON.parse(metadataAttr);
      console.log('📊 TURN 1 METADATA:');
      console.log(`  Speech Act: ${metadata1.speechAct}`);
      console.log(`  Dialogue Act: ${metadata1.dialogueAct}`);
      console.log(`  Rubric Scores:`);
      Object.entries(metadata1.rubricScores || {}).forEach(([key, val]) => {
        console.log(`    ${key}: ${val}`);
      });
      console.log(`  Fit Score: ${metadata1.fitScore}`);
      console.log(`  All Floors Pass: ${metadata1.allFloorsPass}`);
      console.log(`  Can Unlock Email: ${metadata1.canUnlockEmail}\n`);
    }
  } catch (e) {
    console.warn('⚠ Could not extract metadata:', e.message);
  }

  results.turns.push({
    number: 1,
    message: turn1Message,
    response: response1,
    metadata: metadata1
  });

  // ========== TURN 2: Follow-up ==========
  console.log('─'.repeat(100));
  console.log('TURN 2: Follow-up - System Thinking');
  console.log('─'.repeat(100));

  const turn2Message = "That's compelling. I'm curious how you think about the balance between personal freedom and community responsibility. In your experience, do those usually feel like they're in tension, or have you found ways to make them work together?";
  console.log(`\n[${persona}]: "${turn2Message}"\n`);

  await page.waitForTimeout(1000); // Wait for UI to settle
  await input.click();
  await input.clear();
  await input.fill(turn2Message);
  await input.press('Enter');
  console.log('→ Message sent, waiting for response...\n');

  try {
    await page.waitForFunction(() => {
      const chatDiv = document.getElementById('chat-messages');
      return chatDiv && chatDiv.querySelectorAll('div').length > 4;
    }, { timeout: 10000 });
  } catch (e) {
    console.warn('⚠ Timeout waiting for response DOM');
  }

  let response2 = '';
  try {
    const chatText = await page.locator('#chat-messages').innerText();
    const parts = chatText.split('\nAI\n');
    if (parts.length > 1) {
      response2 = parts[parts.length - 1].split('\nYou\n')[0].trim();
    }
    if (!response2 || response2.length === 0) {
      const messages2 = chatText.split(/\n{2,}/).filter(m => m.trim().length > 100);
      response2 = messages2[messages2.length - 1] || '';
    }
  } catch (e) {
    console.warn('⚠ Turn 2 extraction failed:', e.message);
  }

  console.log(`[Guide]: "${response2.substring(0, 200)}${response2.length > 200 ? '...' : ''}"\n`);
  console.log(`Response length: ${response2.length} characters\n`);

  let metadata2 = null;
  try {
    const metadataEl = await page.locator('[data-metadata]').last();
    const metadataAttr = await metadataEl.getAttribute('data-metadata');
    if (metadataAttr) {
      metadata2 = JSON.parse(metadataAttr);
      console.log('📊 TURN 2 METADATA:');
      console.log(`  Speech Act: ${metadata2.speechAct}`);
      console.log(`  Dialogue Act: ${metadata2.dialogueAct}`);
      console.log(`  Rubric Scores:`);
      Object.entries(metadata2.rubricScores || {}).forEach(([key, val]) => {
        console.log(`    ${key}: ${val}`);
      });
      console.log(`  Fit Score: ${metadata2.fitScore}`);
      console.log(`  All Floors Pass: ${metadata2.allFloorsPass}`);
      console.log(`  Can Unlock Email: ${metadata2.canUnlockEmail}\n`);
    }
  } catch (e) {
    console.warn('⚠ Could not extract metadata:', e.message);
  }

  results.turns.push({
    number: 2,
    message: turn2Message,
    response: response2,
    metadata: metadata2
  });

  // ========== TURN 3: Experimentation ==========
  console.log('─'.repeat(100));
  console.log('TURN 3: Probing - Experimentation & Authenticity');
  console.log('─'.repeat(100));

  const turn3Message = "I really appreciate how you're thinking about this. In terms of the actual experiment—what have you already tried that didn't work? And be honest, what are you still uncertain about?";
  console.log(`\n[${persona}]: "${turn3Message}"\n`);

  await page.waitForTimeout(1000); // Wait for UI to settle
  await input.click();
  await input.clear();
  await input.fill(turn3Message);
  await input.press('Enter');
  console.log('→ Message sent, waiting for response...\n');

  try {
    await page.waitForFunction(() => {
      const chatDiv = document.getElementById('chat-messages');
      return chatDiv && chatDiv.querySelectorAll('div').length > 6;
    }, { timeout: 10000 });
  } catch (e) {
    console.warn('⚠ Timeout waiting for response DOM');
  }

  let response3 = '';
  try {
    const chatText = await page.locator('#chat-messages').innerText();
    const parts = chatText.split('\nAI\n');
    if (parts.length > 1) {
      response3 = parts[parts.length - 1].split('\nYou\n')[0].trim();
    }
    if (!response3 || response3.length === 0) {
      const messages3 = chatText.split(/\n{2,}/).filter(m => m.trim().length > 100);
      response3 = messages3[messages3.length - 1] || '';
    }
  } catch (e) {
    console.warn('⚠ Turn 3 extraction failed:', e.message);
  }

  console.log(`[Guide]: "${response3.substring(0, 200)}${response3.length > 200 ? '...' : ''}"\n`);
  console.log(`Response length: ${response3.length} characters\n`);

  let metadata3 = null;
  try {
    const metadataEl = await page.locator('[data-metadata]').last();
    const metadataAttr = await metadataEl.getAttribute('data-metadata');
    if (metadataAttr) {
      metadata3 = JSON.parse(metadataAttr);
      console.log('📊 TURN 3 METADATA:');
      console.log(`  Speech Act: ${metadata3.speechAct}`);
      console.log(`  Dialogue Act: ${metadata3.dialogueAct}`);
      console.log(`  Rubric Scores:`);
      Object.entries(metadata3.rubricScores || {}).forEach(([key, val]) => {
        console.log(`    ${key}: ${val}`);
      });
      console.log(`  Fit Score: ${metadata3.fitScore}`);
      console.log(`  All Floors Pass: ${metadata3.allFloorsPass}`);
      console.log(`  Can Unlock Email: ${metadata3.canUnlockEmail}\n`);
    }
  } catch (e) {
    console.warn('⚠ Could not extract metadata:', e.message);
  }

  results.turns.push({
    number: 3,
    message: turn3Message,
    response: response3,
    metadata: metadata3
  });

  // Get session ID
  const sessionId = await page.evaluate(() => localStorage.getItem('sessionId'));
  results.sessionId = sessionId;

  // ========== SUMMARY ==========
  console.log('═'.repeat(100));
  console.log('TEST COMPLETE');
  console.log('═'.repeat(100));
  console.log(`\nSession ID: ${sessionId}`);
  console.log(`\nTurns completed: ${results.turns.length}`);

  if (metadata3) {
    console.log(`\nFinal Evaluation:`);
    console.log(`  Fit Score: ${metadata3.fitScore}/100`);
    console.log(`  All Floors Pass: ${metadata3.allFloorsPass}`);
    console.log(`  Email Unlock: ${metadata3.canUnlockEmail}`);

    results.summary = {
      finalFitScore: metadata3.fitScore,
      allFloorsPass: metadata3.allFloorsPass,
      emailUnlock: metadata3.canUnlockEmail,
      rubricScores: metadata3.rubricScores,
      speechAct: metadata3.speechAct,
      dialogueAct: metadata3.dialogueAct
    };
  }

  results.endTime = new Date().toISOString();

  // Save results
  const resultsFile = path.join(RESULTS_DIR, `${persona}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved: ${resultsFile}`);
  console.log('\n');

  // Assertions
  expect(results.turns.length).toBeGreaterThanOrEqual(3);
  expect(results.turns.every(t => t.response && t.response.length > 0)).toBe(true);
  expect(sessionId).toBeTruthy();
});
