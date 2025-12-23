import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const SITE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = './playwright/screenshots';
const TRANSCRIPTS_DIR = './playwright/transcripts';

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

// Interactive readline for getting persona responses
function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

test('Interactive Persona Testing - Philosophical Thinker', async ({ page }) => {
  const persona = 'philosophical-thinker';
  const transcript = {
    persona,
    name: 'Philosophical Thinker',
    startTime: new Date().toISOString(),
    turns: [],
    screenshots: []
  };

  // 1. Navigate to site
  console.log(`\n${'='.repeat(80)}`);
  console.log(`INTERACTIVE E2E TEST: ${persona}`);
  console.log('='.repeat(80));
  console.log('\nNavigating to site...');

  await page.goto(SITE_URL);
  await page.waitForLoadState('networkidle');

  // Take initial screenshot
  const initialScreenshot = `${SCREENSHOTS_DIR}/${persona}-00-initial.png`;
  await page.screenshot({ path: initialScreenshot, fullPage: true });
  console.log(`✓ Loaded site`);

  // 2. Interactive conversation loop
  let turnCount = 0;
  let continueConversation = true;

  while (continueConversation) {
    turnCount++;
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`TURN ${turnCount}`);
    console.log('─'.repeat(80));

    // Ask for persona message
    const personaMessage = await prompt(
      `\n[${persona}] Enter your message (or 'done' to end):\n> `
    );

    if (personaMessage.toLowerCase() === 'done') {
      continueConversation = false;
      break;
    }

    // Type message into input (try multiple selectors)
    const inputSelectors = [
      'input[data-testid="chat-input"]',
      'input[aria-label*="message"]',
      'textarea[aria-label*="message"]',
      'input[placeholder*="message"]',
      '[contenteditable="true"]',
      'input[type="text"]',
      'textarea'
    ];

    let input = null;
    for (const selector of inputSelectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
          input = el;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!input) {
      console.error('❌ Could not find message input field. Try adding data-testid="chat-input" to input element.');
      continueConversation = false;
      break;
    }

    await input.click();
    await input.fill(personaMessage);
    console.log(`\nSending: "${personaMessage}"`);

    // Wait for API response
    try {
      await Promise.race([
        page.waitForResponse(resp => resp.url().includes('/api/chat') && resp.status() === 200, { timeout: 10000 }),
        input.press('Enter')
      ]);
    } catch (e) {
      console.warn('⚠ Warning: API timeout or response not captured');
    }

    // Wait for guide response with retries
    let guideText = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.waitForTimeout(1200);
      const aiMessages = page.locator('[data-role="assistant"], .ai-message, .response, [role="assistant"]').last();
      try {
        const text = await aiMessages.textContent({ timeout: 2000 }).catch(() => '');
        if (text && text.trim().length > 10) {
          guideText = text;
          break;
        }
      } catch (e) {
        // Continue retrying
      }
    }

    // Use guideText extracted above
    const guideMessage = guideText || '[Could not extract response - see screenshot]';

    // Try to extract metadata from page
    let metadata = null;
    try {
      const metadataElement = page.locator('[data-metadata]').last();
      const metadataAttr = await metadataElement.getAttribute('data-metadata').catch(() => null);
      if (metadataAttr) {
        metadata = JSON.parse(metadataAttr);
      }
    } catch (e) {
      // Metadata not available yet (frontend not integrated)
      metadata = {
        note: 'Metadata not exposed in DOM - frontend integration pending'
      };
    }

    // Store turn
    const turnData = {
      turnNumber: turnCount,
      personaMessage: personaMessage.trim(),
      guideMessage: guideMessage?.trim() || '[Could not extract]',
      metadata,
      screenshot: null
    };

    // Take screenshot every 2 turns or on interesting moments
    if (turnCount % 2 === 0 || turnCount === 1) {
      const screenshotPath = `${SCREENSHOTS_DIR}/${persona}-turn${turnCount}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      turnData.screenshot = screenshotPath;
      transcript.screenshots.push({
        turn: turnCount,
        path: screenshotPath
      });
      console.log(`✓ Screenshot saved`);
    }

    transcript.turns.push(turnData);

    // Show guide's response
    console.log(`\n[Guide]:`);
    console.log(`${guideMessage?.substring(0, 200) || '[Response not captured]'}${guideMessage?.length > 200 ? '...' : ''}`);

    if (metadata && metadata.fitScore !== undefined && metadata.fitScore !== null) {
      console.log(`\nMetadata: fitScore=${metadata.fitScore}, speechAct=${metadata.speechAct}, dialogueAct=${metadata.dialogueAct}`);
    }
  }

  // 3. Final screenshot
  const finalScreenshot = `${SCREENSHOTS_DIR}/${persona}-final.png`;
  await page.screenshot({ path: finalScreenshot, fullPage: true });
  transcript.screenshots.push({ turn: 'final', path: finalScreenshot });

  // 4. Save transcript
  transcript.endTime = new Date().toISOString();
  const transcriptFile = path.join(TRANSCRIPTS_DIR, `${persona}-interactive-transcript.json`);
  fs.writeFileSync(transcriptFile, JSON.stringify(transcript, null, 2));

  // 5. Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ CONVERSATION COMPLETE`);
  console.log('='.repeat(80));
  console.log(`\nTurns: ${transcript.turns.length}`);
  console.log(`Screenshots: ${transcript.screenshots.length}`);
  console.log(`Transcript: ${transcriptFile}`);
  console.log(`\nNext: Use scripts/extract-golden-cases.js to extract notable turns\n`);

  // Assertions
  expect(transcript.turns.length).toBeGreaterThan(0);
  expect(transcript.turns.every(t => t.personaMessage && t.guideMessage)).toBe(true);
});

test.describe('Interactive Persona Testing', () => {
  // Add more personas as needed
  // Each can be run independently or in sequence
});
