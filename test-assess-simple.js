// Minimal test: exactly 5 user turns, check what happens
const API_URL = 'https://educator-builder.vercel.app/api/chat';

// Exactly 5 user messages = should trigger assess
const messages = [
  { role: 'user', content: 'Question 1: What is freedom to you?' },
  { role: 'assistant', content: 'That is a great question. Tell me more.' },
  { role: 'user', content: 'Question 2: I think about it constantly.' },
  { role: 'assistant', content: 'Interesting. What else?' },
  { role: 'user', content: 'Question 3: I want community and belonging.' },
  { role: 'assistant', content: 'How so?' },
  { role: 'user', content: 'Question 4: I want to live with intentional people.' },
  { role: 'assistant', content: 'Tell me more.' },
  { role: 'user', content: 'Question 5: I am ready to commit.' },
];

console.log('User turns in message array:', messages.filter(m => m.role === 'user').length);
console.log('Triggering assessment (should be 5 user turns = assess)...\n');

fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: messages,
    sessionId: 'assess_test_' + Date.now(),
    email: null
  })
})
  .then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let metadata = null;
    let fullText = '';

    async function read() {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\n');
        if (metadata) {
          console.log('✓ SUCCESS - ASSESSMENT TRIGGERED');
          console.log('Score: ' + metadata.fitScore);
          console.log('Decision: ' + metadata.decision);
        } else {
          console.log('✗ STILL PROBING - Assessment not triggered');
        }
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
                fullText += parsed.text;
              } else if (parsed.type === 'metadata') {
                metadata = parsed;
              }
            } catch (e) {}
          }
        }
      }

      await read();
    }

    return read();
  })
  .catch(err => console.error('ERROR:', err));
