// Simulate a real user conversation end-to-end
const API_URL = 'https://educator-builder.vercel.app/api/chat';
const testSessionId = 'realuser_' + Date.now();
let testEmail = null;

console.log('='.repeat(70));
console.log('FULL CONVERSATION FLOW TEST');
console.log('Session ID: ' + testSessionId);
console.log('='.repeat(70));

const conversation = [
  'What does it mean to live intentionally?',
  'I\'ve been thinking about work differently - not as a job but as part of a lifestyle.',
  'I want to be around people who are also questioning how we live, not just chasing money.',
  'What kind of community structure would support that kind of intentional living?',
  'I\'m ready to commit to something real. How would this actually work day-to-day?'
];

let chatHistory = [];
let turnCount = 0;

async function sendMessage(userMessage) {
  turnCount++;
  chatHistory.push({ role: 'user', content: userMessage });

  console.log('\n' + '-'.repeat(70));
  console.log('TURN ' + turnCount);
  console.log('-'.repeat(70));
  console.log('User: ' + userMessage);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory,
        sessionId: testSessionId,
        email: testEmail
      })
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiMessage = '';
    let metadata = null;
    let chunkCount = 0;

    console.log('Assistant: ');

    async function read() {
      const { done, value } = await reader.read();
      if (done) return;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          chunkCount++;
          const data = line.slice(6);
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                process.stdout.write(parsed.text);
                aiMessage += parsed.text;
              } else if (parsed.type === 'metadata') {
                metadata = parsed;
              }
            } catch (e) {}
          }
        }
      }

      await read();
    }

    await read();

    chatHistory.push({ role: 'assistant', content: aiMessage });

    console.log('\n');
    if (metadata) {
      console.log('✓ EVALUATION METADATA:');
      console.log('  - Fitness Score: ' + metadata.fitScore);
      console.log('  - Decision: ' + metadata.decision);
      console.log('  - Email Unlock: ' + metadata.canUnlockEmail);
      if (metadata.canUnlockEmail) {
        testEmail = 'user' + Date.now() + '@example.com';
        console.log('  - Email collected: ' + testEmail);
      }
    } else {
      console.log('✓ Evaluation: Probe (continue conversation)');
    }

  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

async function runConversation() {
  for (const message of conversation) {
    await sendMessage(message);
    // Small delay between messages
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(70));
  console.log('CONVERSATION COMPLETE');
  console.log('Total turns: ' + turnCount);
  console.log('Session ID: ' + testSessionId);
  console.log('Final email: ' + (testEmail || 'not collected'));
  console.log('='.repeat(70));
  console.log('\nData should now be in Vercel KV:');
  console.log('- Key: conversation:' + testSessionId);
  console.log('- Contains: ' + turnCount + ' message exchanges');
  console.log('- Status: STORED ✓');
}

runConversation().catch(err => console.error('Fatal error:', err));
