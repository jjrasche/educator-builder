// Test multi-turn conversation with evaluation at turn 5
const API_URL = 'https://educator-builder.vercel.app/api/chat';

const conversationHistory = [
  { role: 'user', content: 'I\'ve been obsessed with how we actually want to live. Like, what does freedom really mean?' },
  { role: 'assistant', content: 'That\'s a deep question. What draws you to thinking about freedom specifically?' },
  { role: 'user', content: 'Because I realize I spend most of my time doing things that don\'t align with what I actually care about. I want to build something meaningful.' },
  { role: 'assistant', content: 'When you say meaningful, what does that look like for you?' },
  { role: 'user', content: 'Building with people who actually care. Not extractive work. More like... creating something together that changes how we think about community.' },
];

const userTurns = conversationHistory.filter(m => m.role === 'user').length;
console.log('Testing multi-turn conversation (User turn ' + (userTurns + 1) + ')...\n');

// Add next user message
const userMessage = 'And I want to be part of a living situation where work and community aren\'t separated.';
conversationHistory.push({ role: 'user', content: userMessage });

console.log('User: ' + userMessage);
console.log('\nAssistant: ');

fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: conversationHistory,
    sessionId: 'test_multiturn_xyz',
    email: 'tester@example.com'
  })
})
  .then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let response = '';
    let metadata = null;

    async function read() {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\n\n✓ CONVERSATION TURN COMPLETE');
        if (metadata) {
          console.log('\n📊 EVALUATION RESULT:');
          console.log(JSON.stringify(metadata, null, 2));
        } else {
          console.log('\n✓ Evaluation: PROBE (more turns needed)');
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
                response += parsed.text;
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
