/**
 * Golden Dataset Regression Testing
 *
 * This file is for LOCAL testing only - NOT deployed to Vercel.
 *
 * Usage: Run conversations through the evaluation logic to validate:
 * - New rubric versions don't degrade scoring on known-good conversations
 * - Prompt changes maintain consistency
 * - Edge cases are handled correctly
 *
 * To use:
 * 1. Export a conversation from KV (query by sessionId/email)
 * 2. Create a test case in the GOLDEN_DATASET below
 * 3. Run: node evaluate-test.js
 * 4. Compare scores between rubric versions
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// ========== GOLDEN DATASET ==========
// Add test conversations here that represent known-good evaluations
// Format: { name: string, conversation: [{role, content}], expectedDecision: string }

const GOLDEN_DATASET = [
  // Example - replace with real conversations from KV
  {
    name: 'Deep Thinker Example',
    conversation: [
      { role: 'user', content: 'I\'ve been obsessed with how we organize work. Like, fundamentally - why do we separate life from work?' },
      { role: 'assistant', content: 'What draws you to that question specifically?' },
      { role: 'user', content: 'Because I keep bumping into this in my own life. I\'m building things but always feel disconnected from the community around them.' },
      { role: 'assistant', content: 'That disconnection - is it about the work itself or the environment?' },
      { role: 'user', content: 'Both. Like, I want to be part of something that matters, not just doing tasks.' }
    ],
    expectedDecision: 'request_email'
  }
];

// ========== TESTING FUNCTIONS ==========

async function testGoldenDataset() {
  console.log('Loading rubric...');
  const rubricPath = path.join(process.cwd(), 'data', 'rubric-v1.json');
  const rubricData = fs.readFileSync(rubricPath, 'utf-8');
  const rubric = JSON.parse(rubricData);

  console.log(`\nRunning ${GOLDEN_DATASET.length} golden dataset test(s)...\n`);

  for (const testCase of GOLDEN_DATASET) {
    console.log(`📝 Test: ${testCase.name}`);
    console.log(`   Turns: ${testCase.conversation.filter(m => m.role === 'user').length}`);

    try {
      const result = await evaluateConversation(testCase.conversation, rubric);

      if (result.action === 'assess') {
        console.log(`   Decision: ${result.decision} (fitScore: ${result.fitScore})`);
        console.log(`   Scores:`, result.criteriaScores);
        console.log(`   ✓ Expected: ${testCase.expectedDecision} - ${result.decision === testCase.expectedDecision ? 'PASS' : 'FAIL'}`);
      } else {
        console.log(`   Action: ${result.action}`);
        console.log(`   ProbeQuestion: ${result.probeQuestion}`);
      }
    } catch (error) {
      console.error(`   ✗ ERROR:`, error.message);
    }
    console.log();
  }
}

async function evaluateConversation(chatHistory, rubric) {
  const userTurns = chatHistory.filter(msg => msg.role === 'user').length;
  const transcript = chatHistory
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  // Decision logic: probe early, assess when you have enough information
  const shouldAssess = userTurns >= 5;

  const prompt = shouldAssess
    ? buildAssessmentPrompt(transcript, rubric)
    : buildProbePrompt(transcript, rubric);

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 700
  });

  const responseText = response.choices[0]?.message?.content;

  if (!responseText) {
    throw new Error('Empty response from Groq');
  }

  // Parse JSON
  let parsed;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Parse error:', responseText);
    throw new Error(`Failed to parse response: ${e.message}`);
  }

  // If assessing, calculate fitness score
  if (shouldAssess && parsed.criteriaScores) {
    const fitScore = calculateFitScore(parsed.criteriaScores, rubric);
    return {
      action: 'assess',
      criteriaScores: parsed.criteriaScores,
      rationale: parsed.rationale || '',
      fitScore,
      decision: fitScore >= 60 ? 'request_email' : 'no_email',
      timestamp: new Date().toISOString()
    };
  }

  // Otherwise, return probe
  return {
    action: 'probe',
    probeQuestion: parsed.probeQuestion || 'Tell me more about your thinking on this.',
    timestamp: new Date().toISOString()
  };
}

function buildProbePrompt(transcript, rubric) {
  return `You are Jim, conducting a hiring conversation for a live-in collaboration role focused on freedom, community, and alternative living. Your job is to understand the person deeply.

RUBRIC (for reference):
${JSON.stringify(rubric.criteria, null, 2)}

CONVERSATION SO FAR:
${transcript}

YOUR ROLE:
You are genuinely curious. Ask ONE specific follow-up question to understand their thinking better. Be conversational, not evaluative. Probe the areas where you still have questions.

RESPOND WITH JSON:
{
  "probeQuestion": "Your specific follow-up question here"
}`;
}

function buildAssessmentPrompt(transcript, rubric) {
  return `You are Jim, assessing whether someone is a fit for a live-in collaboration role focused on freedom, community, and alternative living.

RUBRIC:
${JSON.stringify(rubric.criteria, null, 2)}

CONVERSATION:
${transcript}

ASSESSMENT TASK:
Based on everything you've learned across this conversation, score each rubric criterion (1-10). Then provide brief rationale.

RESPOND WITH JSON:
{
  "criteriaScores": {
    "depth-of-questioning": score,
    "self-awareness": score,
    "systems-thinking": score,
    "experimentation-evidence": score,
    "authenticity": score,
    "reciprocal-curiosity": score
  },
  "rationale": "Brief assessment based on conversation"
}`;
}

function calculateFitScore(criteriaScores, rubric) {
  let weightedSum = 0;
  let weightSum = 0;

  for (const criterion of rubric.criteria) {
    const score = criteriaScores[criterion.id] || 5;
    weightedSum += score * criterion.weight;
    weightSum += criterion.weight;
  }

  return Math.round((weightedSum / weightSum) * 10);
}

// ========== RUN TESTS ==========
testGoldenDataset().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
