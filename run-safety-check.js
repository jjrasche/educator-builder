// Safety check runner - executes all 3 personas with thoughtful responses
// Each conversation is crafted to test specific aspects of the conversational quality

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = process.env.API_URL || 'https://educator-builder.vercel.app/api/chat';

// ============ CONVERSATION DEFINITIONS ============

const PERSONA_CONVERSATIONS = {
  'philosophical-thinker': {
    description: 'Genuinely curious about freedom and community. Thinks systemically. Self-aware.',
    expectedScore: '65+',
    testingFor: 'Does it feel like a guide? Does the vibe match "finally someone gets it"?',
    messages: [
      'I\'ve been thinking a lot about what freedom actually means when you\'re part of a community. How do you hold both?',
      'It\'s not that they\'re in tension - I see them as deeply connected. But I want to understand how to navigate that practically.',
      'I\'ve experimented with this before. Started a small co-housing project, questioned my career trajectory. It\'s been messy and real.',
      'What concerns me most is maintaining individual autonomy while building something truly shared. How do you prevent group-think?',
      'I\'m genuinely ready to explore this. But I need to know: do you see people like me actually succeeding in this kind of arrangement?'
    ]
  },

  'transactional-job-seeker': {
    description: 'Just wants a job. Focused on pay, hours, logistics. Resists depth.',
    expectedScore: '<50',
    testingFor: 'Does it try to guide them deeper or just assess surface responses?',
    messages: [
      'What\'s the salary and how many hours per week?',
      'Is there remote flexibility? I need to know the schedule.',
      'Do you have health insurance and a 401k?',
      'What\'s the onboarding process? When could I start?',
      'Can you just tell me what the day-to-day actually looks like in terms of hours and tasks?'
    ]
  },

  'performative-philosopher': {
    description: 'Says the "right things" but it\'s rehearsed. Uses buzzwords, avoids specificity. CRITICAL TEST.',
    expectedScore: '<55',
    testingFor: 'Does it catch the performance? Or does it let them slide?',
    messages: [
      'I\'m really interested in reimagining how we relate to work and freedom in a capitalist paradigm.',
      'Community is definitely something I value. I believe in collective consciousness and mutual aid frameworks.',
      'I\'ve done some intentional living work - workshops, you know, really exploring these paradigms.',
      'The individualism-collectivism dynamic is fascinating. How do you address that in your model?',
      'I see deep value in what you\'re doing. I think I could bring really transformative energy to the space.'
    ]
  },

  'authentic-but-inarticulate': {
    description: 'Genuinely thinking about these things but struggles to articulate. Open but uncertain.',
    expectedScore: '55-65',
    testingFor: 'Does it help them find their voice or just assess their current articulateness?',
    messages: [
      'Um, I think I\'m looking for something different. Like, I feel stuck in how most people work and live?',
      'Yeah, like... community matters but also independence? I\'m not sure how to balance those. It feels like one cancels out the other.',
      'I haven\'t done anything huge, but I\'ve been thinking about it a lot. I want to do something that actually means something.',
      'I guess I want to know if there are other people who feel this way. Like, is this a real thing or just me being weird?',
      'I\'m ready to try something real. Even if I\'m not totally sure what I\'m doing. I think I need to just... try it.'
    ]
  }
};

// ============ SESSION CLASS ============

class TestSession {
  constructor(persona, description) {
    this.persona = persona;
    this.description = description;
    this.sessionId = 'safety_' + persona.replace(/\s+/g, '_') + '_' + Date.now();
    this.chatHistory = [];
    this.transcript = [];
    this.turns = 0;
  }

  async sendMessage(userMessage) {
    this.turns++;
    this.chatHistory.push({ role: 'user', content: userMessage });

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.chatHistory,
          sessionId: this.sessionId,
          email: null
        })
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const { aiMessage, metadata } = await this.parseSSEResponse(response);
      this.chatHistory.push({ role: 'assistant', content: aiMessage });

      this.transcript.push({
        turn: this.turns,
        userMessage,
        aiMessage,
        metadata
      });

      return { aiMessage, metadata };
    } catch (error) {
      console.error('Error:', error.message);
      throw error;
    }
  }

  async parseSSEResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiMessage = '';
    let metadata = null;

    async function read() {
      const { done, value } = await reader.read();
      if (done) return;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
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
    return { aiMessage, metadata };
  }

  displayTurn(userMessage, aiMessage, metadata) {
    console.log('\n' + '-'.repeat(70));
    console.log('TURN ' + this.turns);
    console.log('-'.repeat(70));
    console.log('\nYou: ' + userMessage);
    console.log('\nAI Response:');
    console.log(aiMessage);

    if (metadata) {
      console.log('\n✓ ASSESSMENT TRIGGERED');
      console.log('  Fit Score: ' + metadata.fitScore + '/100');
      console.log('  Decision: ' + metadata.decision);
    } else {
      console.log('\n  📝 Probing (turn ' + this.turns + ')');
    }
  }

  saveTranscript() {
    const filename = this.persona.replace(/\s+/g, '-').toLowerCase();
    const timestamp = Date.now();
    const filepath = path.join(
      path.dirname(__filename),
      'debug-logs',
      filename + '-' + timestamp + '.json'
    );

    // Ensure debug-logs directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      persona: this.persona,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      transcript: this.transcript,
      finalScore: this.transcript[this.transcript.length - 1]?.metadata?.fitScore || 'N/A'
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log('\n✓ Saved: ' + filepath);
    return filepath;
  }
}

// ============ MAIN EXECUTION ============

async function runAllPersonas() {
  console.log('\n' + '='.repeat(70));
  console.log('SAFETY CHECK: MANUAL TESTING WITH 3 PERSONAS');
  console.log('='.repeat(70));
  console.log('\nAPI: ' + API_URL);
  console.log('Goal: Verify conversational quality before launch\n');

  const personas = Object.entries(PERSONA_CONVERSATIONS);

  for (let i = 0; i < personas.length; i++) {
    const [personaName, config] = personas[i];
    const isLast = i === personas.length - 1;

    console.log('\n' + '='.repeat(70));
    console.log('PERSONA ' + (i + 1) + '/' + personas.length + ': ' + personaName.toUpperCase());
    console.log('='.repeat(70));
    console.log('Description: ' + config.description);
    console.log('Expected Score: ' + config.expectedScore);
    console.log('Testing For: ' + config.testingFor);

    const session = new TestSession(personaName, config.description);

    try {
      for (const message of config.messages) {
        const { aiMessage, metadata } = await session.sendMessage(message);
        session.displayTurn(message, aiMessage, metadata);

        if (metadata) {
          console.log('\n🏁 Assessment triggered after turn ' + session.turns);
          break;
        }

        // Small delay between turns
        await new Promise(r => setTimeout(r, 500));
      }

      session.saveTranscript();
    } catch (error) {
      console.error('Error in persona:', error.message);
    }

    if (!isLast) {
      console.log('\nWaiting before next persona...');
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('ALL PERSONAS TESTED - SEE debug-logs/ FOR TRANSCRIPTS');
  console.log('='.repeat(70));
  console.log('\nNext: Review transcripts and provide qualitative feedback\n');
}

runAllPersonas().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
