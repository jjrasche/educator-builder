// Interactive manual testing tool for safety check before launch
// Tests conversational quality with specific personas

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = process.env.API_URL || 'https://educator-builder.vercel.app/api/chat';

// ============ INTERACTIVE SESSION CLASS ============

class InteractiveSession {
  constructor(persona) {
    this.persona = persona;
    this.sessionId = 'manual_' + Date.now();
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
      console.error('Error sending message:', error.message);
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
    console.log('\n' + '='.repeat(70));
    console.log('TURN ' + this.turns);
    console.log('='.repeat(70));
    console.log('\nYou: ' + userMessage);
    console.log('\nAI:');
    console.log(aiMessage);

    if (metadata) {
      console.log('\n' + '✓ ASSESSMENT TRIGGERED');
      console.log('  Fit Score: ' + metadata.fitScore + '/100');
      console.log('  Decision: ' + metadata.decision);
      if (metadata.criteriaScores) {
        console.log('  Criteria Scores:');
        Object.entries(metadata.criteriaScores).forEach(([key, value]) => {
          console.log('    - ' + key + ': ' + value);
        });
      }
    } else {
      console.log('\n  📝 Still probing (turn ' + this.turns + '/5+)');
    }
  }

  saveTranscript(analysis) {
    const timestamp = Date.now();
    const filename = this.persona.replace(/\s+/g, '-').toLowerCase();
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
      analysis: analysis
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log('\n✓ Transcript saved: ' + filepath);
    return filepath;
  }
}

// ============ MAIN INTERACTIVE LOOP ============

async function runManualTest(personaName, personaDescription) {
  console.log('\n' + '='.repeat(70));
  console.log('MANUAL SAFETY CHECK TEST');
  console.log('='.repeat(70));
  console.log('\nPersona: ' + personaName);
  console.log('Description: ' + personaDescription);
  console.log('\nAPI: ' + API_URL);
  console.log('\nInstructions:');
  console.log('  - Read each AI response carefully');
  console.log('  - Type your next message based on your persona');
  console.log('  - Let the conversation flow naturally');
  console.log('  - Type "done" to end and provide analysis');
  console.log('');

  const session = new InteractiveSession(personaName);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function askForMessage(turnNumber) {
    rl.question('\nYour message (turn ' + turnNumber + '): ', async (userMessage) => {
      if (!userMessage.trim()) {
        askForMessage(turnNumber);
        return;
      }

      if (userMessage.toLowerCase() === 'done') {
        rl.question('\nYour analysis of this conversation: ', async (analysis) => {
          session.saveTranscript(analysis);
          rl.close();
          console.log('\nTest complete.\n');
        });
        return;
      }

      try {
        const { aiMessage, metadata } = await session.sendMessage(userMessage);
        session.displayTurn(userMessage, aiMessage, metadata);

        if (metadata) {
          rl.question(
            '\nAssessment triggered. Your analysis of the full conversation: ',
            async (analysis) => {
              session.saveTranscript(analysis);
              rl.close();
              console.log('\nTest complete.\n');
            }
          );
        } else {
          askForMessage(turnNumber + 1);
        }
      } catch (error) {
        console.error('Error:', error.message);
        rl.close();
      }
    });
  }

  askForMessage(1);
}

// ============ CLI INTERFACE ============

const args = process.argv.slice(2);
const personaIndex = args.indexOf('--persona');

if (personaIndex >= 0) {
  const personaName = args[personaIndex + 1];

  const personas = {
    'philosophical-thinker': 'Genuinely curious about freedom and community. Thinks systemically. Self-aware.',
    'transactional-job-seeker': 'Just wants a job. Focused on pay, hours, logistics. Resists depth.',
    'performative-philosopher': 'Says the "right things" but its rehearsed. Uses buzzwords, avoids specificity.',
    'authentic-but-inarticulate': 'Genuinely thinking about these things but struggles to articulate. Open but uncertain.'
  };

  if (personas[personaName]) {
    runManualTest(personaName, personas[personaName]);
  } else {
    console.log('Unknown persona. Available:');
    Object.keys(personas).forEach(p => {
      console.log('  - ' + p);
    });
  }
} else {
  console.log('Usage: node manual-test.js --persona <persona-name>');
  console.log('\nAvailable personas:');
  console.log('  - philosophical-thinker');
  console.log('  - transactional-job-seeker');
  console.log('  - performative-philosopher');
  console.log('  - authentic-but-inarticulate');
}
