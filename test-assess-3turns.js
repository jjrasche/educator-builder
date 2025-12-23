// Test with 3 user turns (should trigger assess with new threshold)
const API_URL = 'https://educator-builder.vercel.app/api/chat';

const messages = [
  { role: 'user', content: 'Question 1?' },
  { role: 'assistant', content: 'Answer 1.' },
  { role: 'user', content: 'Question 2?' },
  { role: 'assistant', content: 'Answer 2.' },
  { role: 'user', content: 'Question 3?' },
];

console.log('Testing with 3 user turns (threshold = 3)...\n');

fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: messages,
    sessionId: 'test_3turn_' + Date.now(),
    email: null
  })
})
  .then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let metadata = null;

    async function read() {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\n');
        if (metadata) {
          console.log('✓ ASSESSMENT TRIGGERED!');
          console.log('Score: ' + metadata.fitScore + '/100');
          console.log('Decision: ' + metadata.decision);
        } else {
          console.log('✗ Still probing');
        }
        return;
      }

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data && data !== '[DONE]') {
            try {
              const p = JSON.parse(data);
              if (p.text) process.stdout.write(p.text);
              else if (p.type === 'metadata') metadata = p;
            } catch (e) {}
          }
        }
      }
      await read();
    }

    return read();
  })
  .catch(err => console.error('ERROR:', err));
