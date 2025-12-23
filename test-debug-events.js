// Debug: Print all data events
const API_URL = 'https://educator-builder.vercel.app/api/chat';

const messages = [
  { role: 'user', content: 'Question?' },
];

console.log('Sending request and printing ALL events...\n');

fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: messages,
    sessionId: 'debug_' + Date.now(),
    email: null
  })
})
  .then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let eventCount = 0;

    async function read() {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\n\nTotal events:', eventCount);
        return;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          eventCount++;
          const data = line.slice(6);
          console.log('Event ' + eventCount + ':', data.slice(0, 100));
        }
      }

      await read();
    }

    return read();
  })
  .catch(err => console.error('ERROR:', err));
