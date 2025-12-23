// Raw API test - show exactly what's being returned

const API_URL = 'https://educator-builder.vercel.app/api/chat';

const messages = [
  { role: 'user', content: 'Turn 1' },
  { role: 'assistant', content: 'Response 1' },
  { role: 'user', content: 'Turn 2' },
  { role: 'assistant', content: 'Response 2' },
  { role: 'user', content: 'Turn 3' },
  { role: 'assistant', content: 'Response 3' },
  { role: 'user', content: 'Turn 4' },
  { role: 'assistant', content: 'Response 4' },
  { role: 'user', content: 'Turn 5' }
];

console.log('Testing with 5 user turns...');
console.log('Expected: Assessment with fitScore + decision\n');

fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: messages,
    sessionId: 'rawtest_' + Date.now(),
    email: null
  })
})
  .then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let eventCount = 0;
    let hasMetadata = false;

    async function read() {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`\nTotal events: ${eventCount}`);
        console.log(`Has assessment metadata: ${hasMetadata}`);
        return;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          eventCount++;
          const data = line.slice(6);
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'metadata') {
                hasMetadata = true;
                console.log('EVENT ' + eventCount + ' [METADATA]:');
                console.log('  fitScore: ' + parsed.fitScore);
                console.log('  decision: ' + parsed.decision);
                console.log('  canUnlockEmail: ' + parsed.canUnlockEmail);
              } else if (parsed.text) {
                console.log('EVENT ' + eventCount + ' [TEXT]: ' + parsed.text.slice(0, 50) + '...');
              }
            } catch (e) {
              console.log('EVENT ' + eventCount + ' [UNPARSEABLE]: ' + data.slice(0, 50));
            }
          }
        }
      }

      await read();
    }

    return read();
  })
  .catch(err => console.error('ERROR:', err.message));
