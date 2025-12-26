// Run all personas through adaptive conversation generation
// Personas respond naturally to what the guide actually says
// No pre-scripted utterances, truly adaptive dialogue

import fs from 'fs';
import path from 'path';
import { Groq } from 'groq-sdk';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const RUNS_PER_PERSONA = 5;
const DELAY_BETWEEN_TURNS = 1500;  // 1.5s between turns
const DELAY_BETWEEN_RUNS = 3000;   // 3s between runs
const MAX_RETRIES = 3;

// Initialize Groq client
const groq = new Groq({ apiKey: GROQ_API_KEY });

// Exponential backoff retry wrapper
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 503 || response.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
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

// Generate next persona message using Groq
// Uses persona objectives, prompt guidance, and conversation history
async function generatePersonaMessage(persona, conversationHistory, turnNumber) {
  const { objectives, conversationStyle, constraints } = persona;

  // Build context about what's been discussed
  const previousResponses = conversationHistory
    .filter(m => m.role === 'assistant')
    .map(m => `- "${m.content.substring(0, 150)}..."`)
    .join('\n');

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
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'user',
        content: systemPrompt
      }
    ],
    max_tokens: 300,
    temperature: 0.8 // Some variation in persona responses
  });

  return response.choices[0].message.content.trim();
}

// Check if conversation should terminate
function shouldTerminate(persona, turnNumber, messages, metadata) {
  const { termination } = persona;
  const { minTurns, maxTurns } = termination;

  // Must hit minimum turns
  if (turnNumber < minTurns) return false;

  // Must stop at maximum turns
  if (turnNumber >= maxTurns) return true;

  // Could add heuristics here based on metadata.fitScore, stance, etc.
  // For now, just use min/max bounds

  return false;
}

const personas = [
  'philosophical-thinker',
  'transactional-seeker',
  'performative-philosopher',
  'authentic-inarticulate',
  'builder-experimenter',
  'systems-thinker',
  'extraction-thinker',
  'curious-individualist'
];

async function runPersona(personaId, runNumber) {
  const personaPath = path.join(process.cwd(), 'testing', 'personas', `${personaId}.json`);
  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));

  const sessionId = `test-${personaId}-run${runNumber}-${Date.now()}`;
  const messages = [];
  const turns = [];

  console.log(`\n  Run ${runNumber}: ${persona.name}`);

  // Turn 1: Send opening message
  const openingMessage = persona.opening.firstMessage;
  messages.push({ role: 'user', content: openingMessage });

  console.log(`    Turn 1 (opening): "${openingMessage.substring(0, 80)}..."`);

  let continueConversation = true;
  let turnNumber = 1;

  while (continueConversation && turnNumber <= persona.termination.maxTurns) {
    // Call guide with accumulated messages
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_TURNS));

    try {
      const response = await fetchWithRetry(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, sessionId, source: 'synthetic' })
      });

      const text = await response.text();

      // Parse SSE response
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

      turns.push({
        turn: turnNumber,
        userMessage: openingMessage || messages[messages.length - 2]?.content || '(opening)',
        aiResponse: aiResponse.substring(0, 150) + (aiResponse.length > 150 ? '...' : ''),
        fitScore: metadata?.fitScore,
        dialogueAct: metadata?.dialogueAct,
        speechAct: metadata?.speechAct,
        stance: metadata?.stance,
        allFloorsPass: metadata?.allFloorsPass,
        rubricScores: metadata?.rubricScores
      });

      const stance = metadata?.stance;
      console.log(`    Turn ${turnNumber}: fitScore=${metadata?.fitScore}, stance=[O:${stance?.orientation},A:${stance?.agency},C:${stance?.certainty}]`);

      // Check if should terminate
      if (shouldTerminate(persona, turnNumber, messages, metadata)) {
        console.log(`    → Conversation terminated at turn ${turnNumber} (max reached)`);
        continueConversation = false;
        break;
      }

      // Generate next persona message
      if (turnNumber < persona.termination.maxTurns) {
        turnNumber++;

        try {
          const personaMessage = await generatePersonaMessage(persona, messages, turnNumber);
          messages.push({ role: 'user', content: personaMessage });
          console.log(`    Turn ${turnNumber} (generated): "${personaMessage.substring(0, 80)}..."`);
        } catch (error) {
          console.error(`    Turn ${turnNumber}: ERROR generating persona message - ${error.message}`);
          continueConversation = false;
          break;
        }
      }

    } catch (error) {
      console.error(`    Turn ${turnNumber}: ERROR - ${error.message}`);
      continueConversation = false;
      break;
    }
  }

  return {
    personaId,
    personaName: persona.name,
    runNumber,
    sessionId,
    expectedDialogueActs: persona.expectedDialogueActs,
    targetRubricDimensions: persona.targetRubricDimensions,
    tier: persona.tier,
    turns,
    finalFitScore: turns[turns.length - 1]?.fitScore,
    turnCount: turns.length,
    timestamp: new Date().toISOString()
  };
}

async function main() {
  // Verify Groq API key
  if (!GROQ_API_KEY) {
    console.error('ERROR: GROQ_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('PERSONA TEST RUN - Adaptive Conversation Generation');
  console.log(`API: ${API_URL}`);
  console.log(`Runs per persona: ${RUNS_PER_PERSONA}`);
  console.log('='.repeat(70));

  const allResults = [];

  for (const personaId of personas) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`PERSONA: ${personaId}`);
    console.log('─'.repeat(70));

    for (let run = 1; run <= RUNS_PER_PERSONA; run++) {
      const result = await runPersona(personaId, run);
      allResults.push(result);

      // Longer delay between runs to avoid rate limiting
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_RUNS));
    }
  }

  // Save results
  const outputPath = path.join(process.cwd(), 'testing', `persona-runs-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  // Analyze by persona
  for (const personaId of personas) {
    const runs = allResults.filter(r => r.personaId === personaId);
    const scores = runs.map(r => r.finalFitScore).filter(s => s != null);
    const turnCounts = runs.map(r => r.turnCount).filter(t => t != null);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
    const min = scores.length ? Math.min(...scores) : 'N/A';
    const max = scores.length ? Math.max(...scores) : 'N/A';
    const avgTurns = turnCounts.length ? (turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length).toFixed(1) : 'N/A';

    console.log(`\n${personaId}:`);
    console.log(`  Final fitScore: avg=${avg}, min=${min}, max=${max}`);
    console.log(`  Scores: [${scores.join(', ')}]`);
    console.log(`  Average turns per conversation: ${avgTurns}`);
  }

  console.log(`\nResults saved to: ${outputPath}`);

  return allResults;
}

main().catch(console.error);
