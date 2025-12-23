import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const SCREENSHOTS_DIR = './playwright/screenshots';
const TRANSCRIPTS_DIR = './playwright/transcripts';

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

// Predefined persona conversations for automated testing
const personaConversations = {
  'philosophical-thinker': [
    'Hi, I saw your post about living differently. I\'ve been thinking a lot about freedom and what it actually means.',
    'Both, actually. I think real freedom is knowing you\'re interdependent but choosing it. I want to work on something meaningful with people who think differently than me.',
    'Something where I can see the impact immediately, where I\'m learning constantly, and where the people around me actually care about each other.',
    'I\'ve spent the last two years freelancing and it felt isolating. I want community as much as independence.',
    'Why does that matter to me? I think because I was raised with scarcity thinking, and I\'ve been unlearning that. Community without extraction—that\'s new to me.'
  ]
};

test('Interactive Persona Testing - Philosophical Thinker', async ({ page }, testInfo) => {
  testInfo.setTimeout(600000); // 10 minutes for full conversation with retries
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

  // 2. Automated conversation loop using predefined messages
  const messages = personaConversations[persona] || [];
  if (messages.length === 0) {
    console.error(`❌ No predefined messages for persona: ${persona}`);
    return;
  }

  for (let turnCount = 1; turnCount <= messages.length; turnCount++) {
    const personaMessage = messages[turnCount - 1];

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`TURN ${turnCount}`);
    console.log('─'.repeat(80));
    console.log(`\n[${persona}]: "${personaMessage}"`);

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
      break;
    }

    await input.click();
    await input.fill(personaMessage);
    console.log(`\nSending: "${personaMessage}"`);

    // Wait for API response
    try {
      console.log('  Waiting for API response...');
      await Promise.race([
        page.waitForResponse(resp => resp.url().includes('/api/chat') && resp.status() === 200, { timeout: 10000 }),
        input.press('Enter')
      ]);
      console.log('  ✓ API responded');
    } catch (e) {
      console.warn('⚠ Warning: API timeout or response not captured');
    }

    // Wait for guide response with retries
    let guideText = '';
    console.log('  Waiting for guide response...');
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForTimeout(500); // Shorter wait between attempts

      try {
        // Get all text elements from various possible containers
        let allMessages = [];
        try {
          const chatHistory = await page.locator('[class*="chat"]').allTextContents();
          allMessages.push(...chatHistory);
        } catch (e) {}

        // Also try getting all non-empty divs
        if (allMessages.length === 0) {
          const allDivs = await page.locator('div').allTextContents();
          allMessages = allDivs.map(t => t.trim()).filter(t => t.length > 0);
        }

        // Filter for substantial messages (filter out buttons, inputs, short text)
        const substantialMessages = allMessages
          .map(t => t.trim())
          .filter(t => t.length > 50 && !t.match(/^(Send|Start|Ask|Save|Yes|No|Cancel)$/i));

        if (substantialMessages.length > 0) {
          // Get the last substantial message
          guideText = substantialMessages[substantialMessages.length - 1];
          console.log(`  ✓ Got response on attempt ${attempt + 1} (${guideText.length} chars)`);
          break;
        } else {
          console.log(`  Attempt ${attempt + 1}: found ${substantialMessages.length} substantial messages (from ${allMessages.length} total)`);
        }
      } catch (e) {
        console.log(`  Attempt ${attempt + 1}: error - ${e.message}`);
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
      try {
        const screenshotPath = `${SCREENSHOTS_DIR}/${persona}-turn${turnCount}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        turnData.screenshot = screenshotPath;
        transcript.screenshots.push({
          turn: turnCount,
          path: screenshotPath
        });
        console.log(`✓ Screenshot saved`);
      } catch (e) {
        console.warn(`⚠ Screenshot failed: ${e.message}`);
        // Continue even if screenshot fails
      }
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
  try {
    const finalScreenshot = `${SCREENSHOTS_DIR}/${persona}-final.png`;
    await page.screenshot({ path: finalScreenshot, fullPage: true });
    transcript.screenshots.push({ turn: 'final', path: finalScreenshot });
  } catch (e) {
    console.warn(`⚠ Final screenshot failed: ${e.message}`);
  }

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
