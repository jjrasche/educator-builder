// Test that assessment triggers at turn 5+
const API_URL = 'https://educator-builder.vercel.app/api/chat';

// 5 user turns (conversation that shows good fit)
const conversationHistory = [
  { role: 'user', content: 'I\'ve been obsessed with how we actually want to live. Like, what does freedom really mean?' },
  { role: 'assistant', content: 'That\'s a deep question. What draws you to thinking about freedom specifically?' },
  { role: 'user', content: 'Because I realize I spend most of my time doing things that don\'t align with what I actually care about. I want to build something meaningful.' },
  { role: 'assistant', content: 'When you say meaningful, what does that look like for you?' },
  { role: 'user', content: 'Building with people who actually care. Not extractive work. More like... creating something together.' },
  { role: 'assistant', content: 'I love that you\'re thinking about reciprocal relationships. What would an ideal community look like?' },
  { role: 'user', content: 'People committed to their own growth and to supporting others. Where decisions are made together, not handed down.' },
  { role: 'assistant', content: 'How important is it that you\'re living in the same physical space as the people you\'re building with?' },
  { role: 'user', content: 'Very. I think proximity creates the conditions for real collaboration. You can\'t build culture remotely.' },
];

const userTurns = conversationHistory.filter(m => m.role === 'user').length;
console.log('Testing ASSESSMENT TRIGGER (User turn ' + (userTurns + 1) + ')...\n');

// Final message that demonstrates deep thinking
const userMessage = 'That\'s exactly why I\'m drawn to a live-in collaborative situation. I want to be part of something intentional from the ground up.';
conversationHistory.push({ role: 'user', content: userMessage });

console.log('User: ' + userMessage);
console.log('\nAssistant: ');

fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: conversationHistory,
    sessionId: 'test_assessment_12345',
    email: null
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
        console.log('\n\n✓ ASSESSMENT COMPLETE');
        if (metadata) {
          console.log('\n' + '='.repeat(60));
          console.log('📊 EVALUATION METADATA RECEIVED:');
          console.log('='.repeat(60));
          console.log('Fitness Score: ' + metadata.fitScore + '/100');
          console.log('Decision: ' + metadata.decision);
          console.log('Can Unlock Email: ' + metadata.canUnlockEmail);
          console.log('='.repeat(60));
        } else {
          console.log('\n❌ No metadata - should have assessment at turn 5+');
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
