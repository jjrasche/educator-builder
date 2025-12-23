import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SITE_URL = 'http://localhost:3000'; // Change to deployed URL
const SCREENSHOTS_DIR = './playwright/screenshots';
const TRANSCRIPTS_DIR = './playwright/transcripts';

// Ensure directories exist
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

// Persona conversation flows
const personas = {
  'philosophical-thinker': {
    name: 'Philosophical Thinker',
    turns: [
      'Hi, I saw your post about living differently. I\'ve been thinking a lot about freedom and what it actually means.',
      'Both, actually. I think real freedom is knowing you\'re interdependent but choosing it. I want to work on something meaningful with people who think differently than me.',
      'Something where I can see the impact immediately, where I\'m learning constantly, and where people actually care about each other.',
      'I\'ve spent the last two years freelancing and it felt isolating. I want community as much as independence.',
      'Why does that matter to you? I think because I was raised with scarcity thinking, and I\'ve been unlearning that. Community without extraction—that\'s new to me.'
    ]
  },
  'transactional-seeker': {
    name: 'Transactional Seeker',
    turns: [
      'What\'s the salary? Or how much is the cash stipend?',
      'So housing is included—what\'s the approximate value? And what about healthcare or other benefits?',
      'How many hours per month is the flexible work, on average? Is there a schedule or is it truly flexible?',
      'What happens if I need to leave? Is there notice required, or can I just go?',
      'Sounds reasonable. Do you have references from people who\'ve lived there? I\'d like to talk to current or former residents.'
    ]
  },
  'performative-philosopher': {
    name: 'Performative Philosopher',
    turns: [
      'I\'m very interested in transformative collective consciousness and paradigm shifts around mutual aid frameworks.',
      'Yes, the intersection of alternative economic models and conscious community reorganization is fascinating to me.',
      'Exactly. I\'ve been reading extensively about horizontal governance structures and post-capitalist thinking.',
      'It resonates deeply. The way we can reimagine the entire fabric of society through intentional community.',
      'That\'s beautiful. I think more people need to understand the potential of these transformative collective visions.'
    ]
  },
  'authentic-inarticulate': {
    name: 'Authentic but Inarticulate',
    turns: [
      'Um, I don\'t really know how to say this. I just... I feel like something\'s wrong with how we\'re living.',
      'Yeah. Like, I have everything I\'m supposed to want but it doesn\'t feel right. I don\'t like being alone so much.',
      'I don\'t know. Just... not alone? People who actually like each other? I don\'t even know if I\'m articulate about what I want.',
      'I like doing things with my hands. Building stuff. But alone it\'s depressing.',
      'I dunno. Maybe. I just know I can\'t keep doing what I\'m doing. Something needs to change.'
    ]
  }
};

test.describe('E2E Persona Testing', () => {
  for (const [personaKey, personaData] of Object.entries(personas)) {
    test(`${personaData.name} - Full Conversation Flow`, async ({ page }) => {
      const transcript = {
        persona: personaKey,
        name: personaData.name,
        startTime: new Date().toISOString(),
        turns: [],
        screenshots: []
      };

      // 1. Navigate to site
      await page.goto(SITE_URL);
      await page.waitForLoadState('networkidle');

      // Take screenshot of initial state
      const initialScreenshot = `${SCREENSHOTS_DIR}/${personaKey}-00-initial.png`;
      await page.screenshot({ path: initialScreenshot, fullPage: true });
      transcript.screenshots.push({ turn: 'initial', path: initialScreenshot });

      // 2. Run conversation turns
      for (let turnNum = 0; turnNum < personaData.turns.length; turnNum++) {
        const userMessage = personaData.turns[turnNum];

        // Find message input and send
        const input = page.locator('input[placeholder*="message"], textarea, input[type="text"]').first();
        await input.click();
        await input.fill(userMessage);

        // Capture turn data
        const turnData = {
          turnNumber: turnNum + 1,
          userMessage: userMessage,
          aiResponse: null,
          metadata: null,
          screenshotPath: null
        };

        // Send message and wait for response
        await Promise.all([
          page.waitForResponse(response => response.url().includes('/api/chat')),
          input.press('Enter')
        ]);

        // Wait for response to appear
        await page.waitForTimeout(1000);

        // Extract AI response from DOM (adjust selectors based on your UI)
        const aiMessages = page.locator('[data-role="assistant"], .ai-message, .response');
        const lastMessage = aiMessages.last();
        if (lastMessage) {
          const responseText = await lastMessage.textContent();
          turnData.aiResponse = responseText?.trim();
        }

        // Try to capture metadata from data attributes or console
        // (Frontend should expose fitScore, speechAct, dialogueAct, etc.)
        const metadataElement = page.locator('[data-metadata], .metadata, .evaluation');
        if (metadataElement) {
          const metadata = await metadataElement.getAttribute('data-metadata');
          if (metadata) {
            turnData.metadata = JSON.parse(metadata);
          }
        }

        // Take screenshot after response
        const turnScreenshot = `${SCREENSHOTS_DIR}/${personaKey}-turn${turnNum + 1}.png`;
        await page.screenshot({ path: turnScreenshot, fullPage: true });
        turnData.screenshotPath = turnScreenshot;
        transcript.screenshots.push({ turn: turnNum + 1, path: turnScreenshot });

        // Store turn data
        transcript.turns.push(turnData);

        // Small delay before next turn
        if (turnNum < personaData.turns.length - 1) {
          await page.waitForTimeout(500);
        }
      }

      // 3. Final state screenshot and summary
      const finalScreenshot = `${SCREENSHOTS_DIR}/${personaKey}-final.png`;
      await page.screenshot({ path: finalScreenshot, fullPage: true });
      transcript.screenshots.push({ turn: 'final', path: finalScreenshot });

      // 4. Save transcript
      transcript.endTime = new Date().toISOString();
      const transcriptFile = path.join(TRANSCRIPTS_DIR, `${personaKey}-transcript.json`);
      fs.writeFileSync(transcriptFile, JSON.stringify(transcript, null, 2));

      // 5. Assertions - verify conversation happened
      expect(transcript.turns.length).toBe(personaData.turns.length);
      expect(transcript.turns.every(t => t.aiResponse)).toBe(true);

      console.log(`✅ ${personaData.name} test complete`);
      console.log(`   Transcript: ${transcriptFile}`);
      console.log(`   Screenshots: ${transcript.screenshots.length} captured`);
    });
  }
});

test.describe('KV Storage Verification', () => {
  test('Verify conversation data is stored in KV', async ({ page }) => {
    // After persona tests, query KV to verify data was stored
    // This requires a KV query endpoint (Phase 5)

    // For now, just navigate and check that session ID is set
    await page.goto(SITE_URL);

    const sessionId = await page.evaluate(() => {
      return localStorage.getItem('sessionId') || sessionStorage.getItem('sessionId');
    });

    expect(sessionId).toBeTruthy();
    console.log(`Session ID found: ${sessionId}`);
  });
});
