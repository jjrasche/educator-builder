#!/usr/bin/env node

// Quick test of the new adaptive persona system
// Runs philosophical-thinker with 1 run to validate the approach

import fs from 'fs';
import path from 'path';
import { Groq } from 'groq-sdk';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DELAY_BETWEEN_TURNS = 1500;
const MAX_RETRIES = 3;

const groq = new Groq({ apiKey: GROQ_API_KEY });

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 503 || response.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`      [Retry ${attempt}/${retries}] Got ${response.status}, waiting ${backoff/1000}s...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      const backoff = Math.pow(2, attempt) * 1000;
      console.log(`      [Retry ${attempt}/${retries}] Error: ${error.message}, waiting ${backoff/1000}s...`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}

async function generatePersonaMessage(persona, conversationHistory, turnNumber) {
  const { objectives, conversationStyle, constraints } = persona;

  const unansweredQuestions = objectives.mustAnswer.filter(q => {
    const text = conversationHistory.map(m => m.content).join('\n').toLowerCase();
    return !text.includes(q.toLowerCase());
  });

  const systemPrompt = `You are roleplaying as a specific persona in a conversation about a community/project.

**Your Persona Profile:**
- Name: ${persona.name}
- Primary Objective: ${objectives.primary}
- Critical Questions You Need Answered: ${objectives.mustAnswer.join('; ')}
- Conversation Style: ${conversationStyle.promptGuidance}
- Response Constraints: ${constraints?.conversationalLimits?.join('; ') || 'None'}

**Conversation so far:**
${conversationHistory.map(m => `${m.role === 'user' ? 'You' : 'Guide'}: ${m.content}`).join('\n')}

**Critical questions still unanswered:**
${unansweredQuestions.length > 0 ? unansweredQuestions.join('\n') : 'Most questions have been addressed'}

**Your task:**
Generate your next message. Remember:
1. Always acknowledge what was just said before asking new questions
2. If critical questions remain unanswered, circle back to them naturally
3. Show you're genuinely listening to the answers, not following a script
4. Stay in character as ${persona.name}
5. Keep it under 200 words
6. Ask 1-2 follow-up questions if appropriate

Generate only the message text, no meta-commentary.`;

  const response = await groq.chat.completions.create({
    model: 'mixtral-8x7b-32768',
    messages: [
      {
        role: 'user',
        content: systemPrompt
      }
    ],
    max_tokens: 300,
    temperature: 0.8
  });

  return response.choices[0].message.content.trim();
}

async function testPersona() {
  if (!GROQ_API_KEY) {
    console.error('ERROR: GROQ_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('ADAPTIVE PERSONA TEST - philosophical-thinker');
  console.log(`API: ${API_URL}`);
  console.log('='.repeat(70));

  const personaPath = path.join(process.cwd(), 'testing', 'personas', 'philosophical-thinker.json');
  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));

  const sessionId = `test-adaptive-${Date.now()}`;
  const messages = [];
  const turns = [];

  console.log(`\nTesting: ${persona.name}`);
  console.log(`Objective: ${persona.objectives.primary}`);
  console.log(`Opening: "${persona.opening.firstMessage}"\n`);

  // Turn 1: Opening message
  const openingMessage = persona.opening.firstMessage;
  messages.push({ role: 'user', content: openingMessage });

  console.log(`Turn 1 (persona opening):`);
  console.log(`  User: "${openingMessage}"\n`);

  let turnNumber = 1;
  let continueConversation = true;

  while (continueConversation && turnNumber <= persona.termination.maxTurns) {
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_TURNS));

    try {
      // Get guide response
      console.log(`  Calling /api/chat...`);
      const response = await fetchWithRetry(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, sessionId })
      });

      const text = await response.text();

      let aiResponse = '';
      let metadata = null;

      for (const line of text.split('\n')) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) aiResponse = data.text;
            if (data.type === 'metadata') metadata = data;
          } catch (e) {}
        }
      }

      messages.push({ role: 'assistant', content: aiResponse });

      const stance = metadata?.stance;
      console.log(`Turn ${turnNumber} (guide response):`);
      console.log(`  fitScore=${metadata?.fitScore}, stance=[O:${stance?.orientation},A:${stance?.agency},C:${stance?.certainty}]`);
      console.log(`  dialogueAct=${metadata?.dialogueAct}`);
      console.log(`  Response: "${aiResponse.substring(0, 120)}..."\n`);

      turns.push({
        turn: turnNumber,
        fitScore: metadata?.fitScore,
        dialogueAct: metadata?.dialogueAct,
        speechAct: metadata?.speechAct,
        stance: metadata?.stance,
        allFloorsPass: metadata?.allFloorsPass,
        rubricScores: metadata?.rubricScores
      });

      // Check termination
      if (turnNumber >= persona.termination.maxTurns) {
        console.log(`→ Conversation reached max turns (${persona.termination.maxTurns})`);
        continueConversation = false;
        break;
      }

      // Generate next persona message
      if (turnNumber < persona.termination.maxTurns) {
        turnNumber++;

        try {
          console.log(`Generating turn ${turnNumber} (persona response)...`);
          const personaMessage = await generatePersonaMessage(persona, messages, turnNumber);
          messages.push({ role: 'user', content: personaMessage });
          console.log(`  "${personaMessage.substring(0, 120)}..."\n`);
        } catch (error) {
          console.error(`ERROR generating persona message: ${error.message}`);
          continueConversation = false;
          break;
        }
      }

    } catch (error) {
      console.error(`ERROR at turn ${turnNumber}: ${error.message}`);
      continueConversation = false;
      break;
    }
  }

  // Summary
  console.log('='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`\nConversation length: ${turns.length} guide responses`);
  console.log(`\nFitScore progression:`);
  turns.forEach((t, i) => {
    console.log(`  Turn ${i + 1}: ${t.fitScore}`);
  });

  if (turns.length > 0) {
    console.log(`\nFinal fitScore: ${turns[turns.length - 1].fitScore}`);
    console.log(`\nDialogue Acts Used:`);
    const acts = {};
    turns.forEach(t => {
      acts[t.dialogueAct] = (acts[t.dialogueAct] || 0) + 1;
    });
    Object.entries(acts).forEach(([act, count]) => {
      console.log(`  ${act}: ${count}`);
    });
  }

  console.log('\n✓ Test complete. Check if:');
  console.log('  1. Persona messages are adaptive (acknowledge what guide said)');
  console.log('  2. Guide gives different dialogue acts across turns');
  console.log('  3. fitScore changes based on conversation quality');
  console.log('  4. Conversation feels natural, not scripted');
}

testPersona().catch(console.error);
