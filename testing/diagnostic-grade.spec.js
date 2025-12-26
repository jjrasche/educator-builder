import { test, expect } from '@playwright/test';

test('Diagnostic check of grade.html', async ({ page }) => {
  const baseUrl = 'http://localhost:3000';
  const testUrl = `${baseUrl}/grade.html`;

  console.log('\n=== STARTING DIAGNOSTIC TEST ===');
  console.log(`Testing URL: ${testUrl}\n`);

  // Capture console messages
  const consoleMessages = [];
  const errors = [];
  const warnings = [];

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();

    consoleMessages.push({ type, text });

    if (type === 'error') {
      errors.push(text);
      console.log(`❌ Console Error: ${text}`);
    } else if (type === 'warning') {
      warnings.push(text);
      console.log(`⚠️  Console Warning: ${text}`);
    } else {
      console.log(`📝 Console ${type}: ${text}`);
    }
  });

  // Capture network requests
  const requests = [];
  page.on('request', request => {
    requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType()
    });
    console.log(`🌐 Request: ${request.method()} ${request.url()}`);
  });

  // Capture network responses
  page.on('response', response => {
    console.log(`📥 Response: ${response.status()} ${response.url()}`);
  });

  // Capture page errors
  page.on('pageerror', error => {
    console.log(`💥 Page Error: ${error.message}`);
    errors.push(`Page Error: ${error.message}`);
  });

  try {
    // Navigate to the page
    console.log('\n--- Navigating to page ---');
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 10000 });

    // Wait a moment for any dynamic content
    await page.waitForTimeout(2000);

    // Take initial screenshot
    console.log('\n--- Taking initial screenshot ---');
    await page.screenshot({
      path: 'playwright/screenshots/grade-initial.png',
      fullPage: true
    });
    console.log('✅ Screenshot saved to playwright/screenshots/grade-initial.png');

    // Check DOM state
    console.log('\n--- Checking DOM State ---');

    // Check for key elements
    const queueHeader = await page.$('#queue-header');
    const queueList = await page.$('#queue-list');
    const graderPanel = await page.$('#grader-panel');
    const loadingText = await page.textContent('body');

    console.log(`Queue Header exists: ${!!queueHeader}`);
    console.log(`Queue List exists: ${!!queueList}`);
    console.log(`Grader Panel exists: ${!!graderPanel}`);

    // Check if loading or loaded
    if (loadingText.includes('Loading queue')) {
      console.log('📊 Status: Page shows "Loading queue..."');
    } else {
      console.log('📊 Status: Page appears to be loaded');
    }

    // Get queue items
    const queueItems = await page.$$('#queue-list li');
    console.log(`📋 Queue items found: ${queueItems.length}`);

    if (queueItems.length > 0) {
      console.log('\n--- Queue Items ---');
      for (let i = 0; i < Math.min(queueItems.length, 5); i++) {
        const text = await queueItems[i].textContent();
        console.log(`  ${i + 1}. ${text.substring(0, 100)}...`);
      }
    }

    // Get grader panel state
    const graderVisible = await page.isVisible('#grader-panel');
    console.log(`\nGrader Panel visible: ${graderVisible}`);

    if (graderVisible) {
      const transcriptText = await page.textContent('#transcript-content');
      console.log(`Transcript content length: ${transcriptText.length} chars`);
    }

    // Try to interact: click first queue item if exists
    if (queueItems.length > 0) {
      console.log('\n--- Testing Interaction ---');
      console.log('Clicking first queue item...');

      await queueItems[0].click();
      await page.waitForTimeout(1000);

      // Take screenshot after click
      await page.screenshot({
        path: 'playwright/screenshots/grade-after-click.png',
        fullPage: true
      });
      console.log('✅ Screenshot after click saved to playwright/screenshots/grade-after-click.png');

      // Check if grader panel appeared
      const graderVisibleAfter = await page.isVisible('#grader-panel');
      console.log(`Grader Panel visible after click: ${graderVisibleAfter}`);

      if (graderVisibleAfter) {
        const transcriptAfter = await page.textContent('#transcript-content');
        console.log(`Transcript loaded: ${transcriptAfter.length > 0}`);
        console.log(`Transcript preview: ${transcriptAfter.substring(0, 200)}...`);
      }
    }

    // Summary Report
    console.log('\n=== DIAGNOSTIC SUMMARY ===');
    console.log(`Total Console Messages: ${consoleMessages.length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Warnings: ${warnings.length}`);
    console.log(`Network Requests: ${requests.length}`);
    console.log(`Queue Items Found: ${queueItems.length}`);

    if (errors.length > 0) {
      console.log('\n❌ ERRORS FOUND:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  WARNINGS FOUND:');
      warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
    }

    // API requests specifically
    const apiRequests = requests.filter(r => r.url.includes('/api/'));
    if (apiRequests.length > 0) {
      console.log('\n🔌 API REQUESTS:');
      apiRequests.forEach(req => console.log(`  ${req.method} ${req.url}`));
    }

  } catch (error) {
    console.error('\n💥 TEST FAILED:', error.message);

    // Take error screenshot
    await page.screenshot({
      path: 'playwright/screenshots/grade-error.png',
      fullPage: true
    });
    console.log('📸 Error screenshot saved');

    throw error;
  }
});
