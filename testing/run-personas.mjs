/**
 * Persona Runner v2.0
 *
 * Runs synthetic personas through the chat API using the Persona Engine.
 * Features:
 * - Emotional state tracking with inertia
 * - Probabilistic exit decisions
 * - LLM reaction parsing with validation
 * - Full conversation logging for analysis
 */

import fs from 'fs';
import path from 'path';
import { Groq } from 'groq-sdk';
import {
  initEmotionalState,
  updateState,
  shouldTerminate,
  buildPersonaPrompt,
  buildExitMessagePrompt,
  parsePersonaResponse,
  generateRunLog,
  printValidationReport
} from './persona-engine.mjs';

// ========== CONFIGURATION ==========

const API_URL = process.env.API_URL || 'http://localhost:3000';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const RUNS_PER_PERSONA = parseInt(process.env.RUNS_PER_PERSONA || '5', 10);
const DELAY_BETWEEN_TURNS = 1500;  // 1.5s between turns
const DELAY_BETWEEN_RUNS = 3000;   // 3s between runs
const MAX_RETRIES = 3;
const MAX_PARSE_RETRIES = 1;  // Retry once on parse failure, then stop

// Initialize Groq client
let groq = null;
function getGroq() {
  if (!groq) {
    groq = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groq;
}

// ========== UTILITY FUNCTIONS ==========

/**
 * Exponential backoff retry wrapper for API calls
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 503 || response.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`      [Retry ${attempt}/${retries}] Got ${response.status}, waiting ${backoff / 1000}s...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      const backoff = Math.pow(2, attempt) * 1000;
      console.log(`      [Retry ${attempt}/${retries}] Error: ${error.message}, waiting ${backoff / 1000}s...`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}

/**
 * Load persona from JSON file
 */
function loadPersona(personaId) {
  const personaPath = path.join(process.cwd(), 'testing', 'personas', `${personaId}.json`);
  if (!fs.existsSync(personaPath)) {
    throw new Error(`Persona not found: ${personaPath}`);
  }
  return JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
}

/**
 * Get list of active (non-archived) personas
 */
function getActivePersonas() {
  const personasDir = path.join(process.cwd(), 'testing', 'personas');
  const files = fs.readdirSync(personasDir);

  return files
    .filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'schema.json')
    .map(f => f.replace('.json', ''));
}

/**
 * Parse SSE response from chat API
 */
function parseSSEResponse(text) {
  let aiResponse = '';
  let metadata = null;

  for (const line of text.split('\n')) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.text) aiResponse = data.text;
        if (data.type === 'metadata') metadata = data;
      } catch (e) { }
    }
  }

  return { aiResponse, metadata };
}

// ========== PERSONA MESSAGE GENERATION ==========

/**
 * Generate next persona message using Groq
 * Includes emotional state in prompt
 */
async function generatePersonaMessage(persona, messages, state, retryCount = 0) {
  const prompt = buildPersonaPrompt(persona, messages, state);

  const response = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
    temperature: 0.8
  });

  const rawOutput = response.choices[0]?.message?.content || '';
  const parsed = parsePersonaResponse(rawOutput);

  if (!parsed) {
    if (retryCount < MAX_PARSE_RETRIES) {
      console.log(`      [Parse retry ${retryCount + 1}] Failed to parse response, retrying...`);
      return generatePersonaMessage(persona, messages, state, retryCount + 1);
    }
    // After max retries, fail hard to avoid wasting inference cost
    throw new Error(`Failed to parse persona response after ${MAX_PARSE_RETRIES + 1} attempts. Raw output: ${rawOutput.substring(0, 200)}...`);
  }

  return parsed;
}

/**
 * Generate exit message if appropriate
 */
async function generateExitMessage(persona, state, exitReason, messages) {
  const prompt = buildExitMessagePrompt(persona, state, exitReason, messages);
  if (!prompt) return null;  // No message for this exit type

  const response = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150,
    temperature: 0.7
  });

  return response.choices[0]?.message?.content?.trim() || null;
}

// ========== MAIN RUN FUNCTION ==========

/**
 * Run a single persona through the conversation
 */
async function runPersona(personaId, runNumber) {
  const persona = loadPersona(personaId);
  const sessionId = `test-${personaId}-run${runNumber}-${Date.now()}`;
  const messages = [];
  const turns = [];

  console.log(`\n  Run ${runNumber}: ${persona.name}`);

  // Initialize emotional state
  let state = initEmotionalState(persona);

  // Turn 1: Send opening message
  const openingMessage = persona.opening?.firstMessage || "Hi, I'm interested in learning more about what you're building.";
  messages.push({ role: 'user', content: openingMessage });

  console.log(`    Turn 1 (opening): "${openingMessage.substring(0, 60)}..."`);

  let turnNumber = 1;
  let exitResult = null;

  while (turnNumber <= (persona.termination?.maxTurns || 25)) {
    // Delay between turns
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_TURNS));

    try {
      // Call chat API
      const response = await fetchWithRetry(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, sessionId, source: 'synthetic' })
      });

      const text = await response.text();
      const { aiResponse, metadata } = parseSSEResponse(text);

      if (!aiResponse) {
        throw new Error('Empty response from chat API');
      }

      messages.push({ role: 'assistant', content: aiResponse });

      // Store turn data (including persona engine data for synthetic turns)
      const turnData = {
        turn: turnNumber,
        userMessage: messages[messages.length - 2]?.content || '',
        aiResponse: aiResponse.substring(0, 150) + (aiResponse.length > 150 ? '...' : ''),
        fitScore: metadata?.fitScore,
        dialogueAct: metadata?.dialogueAct,
        speechAct: metadata?.speechAct,
        stance: metadata?.stance,
        allFloorsPass: metadata?.allFloorsPass,
        rubricScores: metadata?.rubricScores
      };
      turns.push(turnData);

      // Log turn
      const stance = metadata?.stance;
      console.log(`    Turn ${turnNumber}: fitScore=${metadata?.fitScore}, eng=${state.engagement.toFixed(2)} trust=${state.trust.toFixed(2)} frust=${state.frustration.toFixed(2)}`);

      // Check if should terminate BEFORE generating next message
      exitResult = shouldTerminate(state, turnNumber, persona);

      if (exitResult.exit) {
        console.log(`    → Exit: ${exitResult.reason} (p=${(exitResult.probability || 0).toFixed(2)})`);

        // Generate final message if appropriate
        if (exitResult.generateMessage) {
          try {
            const exitMsg = await generateExitMessage(persona, state, exitResult.reason, messages);
            if (exitMsg) {
              messages.push({ role: 'user', content: exitMsg });
              // Send exit message to API to store the final exchange
              await fetchWithRetry(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages, sessionId, source: 'synthetic' })
              });
              console.log(`    → Exit message: "${exitMsg.substring(0, 60)}..."`);
            }
          } catch (exitError) {
            console.log(`    → (no exit message: ${exitError.message})`);
          }
        }

        break;
      }

      // Generate next persona message (if not exiting)
      if (turnNumber < (persona.termination?.maxTurns || 25)) {
        turnNumber++;

        try {
          const personaResponse = await generatePersonaMessage(persona, messages, state);

          // Update emotional state based on reaction
          state = updateState(state, personaResponse.reaction, persona, turnNumber);

          messages.push({ role: 'user', content: personaResponse.message });

          console.log(`    Turn ${turnNumber}: "${personaResponse.message.substring(0, 60)}..."`);

        } catch (error) {
          console.error(`    Turn ${turnNumber}: FATAL - ${error.message}`);
          exitResult = { exit: true, reason: 'parse_error' };
          break;
        }
      }

    } catch (error) {
      console.error(`    Turn ${turnNumber}: ERROR - ${error.message}`);
      exitResult = { exit: true, reason: 'error' };
      break;
    }
  }

  // If we hit max turns without exiting
  if (!exitResult?.exit) {
    exitResult = { exit: true, reason: 'max_turns', probability: 1.0 };
    console.log(`    → Exit: max_turns (reached limit)`);
  }

  return {
    personaId,
    personaName: persona.name,
    runNumber,
    sessionId,
    exitReason: exitResult.reason,
    exitProbability: exitResult.probability,
    exitProbabilities: exitResult.exitProbabilities,
    turnCount: turnNumber,
    turns,
    finalState: state,
    timestamp: new Date().toISOString()
  };
}

// ========== MAIN ENTRY POINT ==========

async function main() {
  // Verify environment
  if (!GROQ_API_KEY) {
    console.error('ERROR: GROQ_API_KEY environment variable not set');
    process.exit(1);
  }

  const personas = getActivePersonas();

  if (personas.length === 0) {
    console.error('ERROR: No active personas found in testing/personas/');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('PERSONA ENGINE v2.0 - Emotional State Tracking');
  console.log(`API: ${API_URL}`);
  console.log(`Personas: ${personas.join(', ')}`);
  console.log(`Runs per persona: ${RUNS_PER_PERSONA}`);
  console.log('='.repeat(70));

  const allResults = [];

  for (const personaId of personas) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`PERSONA: ${personaId}`);
    console.log('─'.repeat(70));

    for (let run = 1; run <= RUNS_PER_PERSONA; run++) {
      try {
        const result = await runPersona(personaId, run);
        allResults.push(result);
      } catch (error) {
        console.error(`  Run ${run}: FATAL ERROR - ${error.message}`);
        // Continue with other runs
      }

      // Delay between runs
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_RUNS));
    }
  }

  // Save results
  const outputPath = path.join(process.cwd(), 'testing', `persona-runs-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allResults.map(generateRunLog), null, 2));

  // Print validation report
  printValidationReport(allResults);

  console.log(`\nResults saved to: ${outputPath}`);

  return allResults;
}

main().catch(error => {
  console.error('FATAL:', error);
  process.exit(1);
});
