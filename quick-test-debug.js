// Quick test to trigger assessment and see debug logs
import fetch from 'node-fetch';

const API_URL = 'https://educator-builder.vercel.app/api/chat';

const messages = [
  { role: 'user', content: 'What does freedom mean to you?' },
  { role: 'assistant', content: 'That is a great question about freedom.' },
  { role: 'user', content: 'I think about it constantly.' },
  { role: 'assistant', content: 'Tell me more.' },
  { role: 'user', content: 'I want community and belonging.' },
  { role: 'assistant', content: 'Interesting.' },
  { role: 'user', content: 'I want to live with intentional people.' },
  { role: 'assistant', content: 'How so?' },
  { role: 'user', content: 'I am ready to commit.' }
];

console.log('Sending 5-user-turn message set to trigger assessment...\n');
console.log('User turns:', messages.filter(m => m.role === 'user').length);

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

    async function read() {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\n\nStream complete.');
        return;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                process.stdout.write(parsed.text);
              } else if (parsed.type === 'metadata') {
                console.log('\n\n✓ METADATA RECEIVED:', JSON.stringify(parsed, null, 2));
              }
            } catch (e) {}
          }
        }
      }

      await read();
    }

    return read();
  })
  .catch(err => console.error('ERROR:', err.message));
