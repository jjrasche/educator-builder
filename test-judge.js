#!/usr/bin/env node

// Local test harness for judge validation
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test conversations from user spec
const testConversations = [
  [{ role: 'user', content: 'I want to build a better world together.' }],
  [{ role: 'user', content: 'I need affordable housing and flexible schedule.' }],
  [{ role: 'user', content: 'I\'ve been thinking about freedom and community for years. I tried living in an intentional community once, and I learned I need both independence and belonging. What does freedom mean to you?' }],
  [{ role: 'user', content: 'This sounds cool. How much does it pay?' }],
  [{ role: 'user', content: 'I\'m extremely passionate about regenerative systems and I\'m very aligned with your vision of freedom through interdependence.' }],
];

const testLabels = [
  'TEST 1: Vague world-building',
  'TEST 2: Logistics-focused (housing + schedule)',
  'TEST 3: Deep freedom/community exploration',
  'TEST 4: Pure transaction (pay question)',
  'TEST 5: Passionate alignment claim',
];

// Load rubric
const rubricPath = path.join(__dirname, 'data', 'rubric-v1.json');
const rubricData = fs.readFileSync(rubricPath, 'utf-8');
const rubric = JSON.parse(rubricData);

// Groq client
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Main test runner
async function runTests() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('JUDGE VALIDATION TEST SUITE');
  console.log('════════════════════════════════════════════════════════\n');

  const results = [];

  for (let i = 0; i < testConversations.length; i++) {
    const conv = testConversations[i];
    const label = testLabels[i];

    console.log(`\n${label}`);
    console.log('─'.repeat(60));

    try {
      const result = await callJudge(conv);

      // Validate JSON structure
      if (!result.criteriaScores || !result.rationale) {
        throw new Error('Missing required fields in judge response');
      }

      // Display scores
      console.log('\n✅ VALID JSON');
      console.log('\nScores:');
      for (const [key, score] of Object.entries(result.criteriaScores)) {
        const criterion = rubric.criteria.find(c => c.id === key);
        const floor = criterion?.floor || 2;
        const passFloor = score >= floor ? '✓' : '✗ FLOOR BREACH';
        console.log(`  ${key.padEnd(30)} ${score}/10  ${passFloor}`);
      }

      console.log(`\nRationale:\n  "${result.rationale}"`);
      console.log(`\nCoaching Question:\n  "${result.coachingQuestion || 'null'}"`);

      results.push({
        index: i,
        label,
        success: true,
        result,
      });

    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      results.push({
        index: i,
        label,
        success: false,
        error: error.message,
      });
    }
  }

  // Summary
  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('TEST SUMMARY');
  console.log('════════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.success).length;
  const total = results.length;

  console.log(`Passed: ${passed}/${total}`);
  console.log(`\nTest Results:\n`);

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.label}`);
    if (!r.success) {
      console.log(`   Error: ${r.error}`);
    }
  }

  // Fit calculation analysis
  if (results.every(r => r.success)) {
    console.log('\n\n════════════════════════════════════════════════════════');
    console.log('FIT CALCULATION ANALYSIS');
    console.log('════════════════════════════════════════════════════════\n');

    for (const r of results) {
      const scores = r.result.criteriaScores;

      // Calculate fit like calculate-fit.js does
      let floorsPass = true;
      const floorBreaches = [];

      for (const criterion of rubric.criteria) {
        const score = scores[criterion.id];
        if (score < criterion.floor) {
          floorsPass = false;
          floorBreaches.push(criterion.id);
        }
      }

      // Calculate weighted fit score
      let weightedSum = 0;
      let weightSum = 0;

      for (const criterion of rubric.criteria) {
        const score = scores[criterion.id] || 5;
        weightedSum += score * criterion.weight;
        weightSum += criterion.weight;
      }

      const fitScore = Math.round((weightedSum / weightSum) * 10);
      const canUnlockEmail = fitScore >= rubric.overallPassThreshold && floorsPass;

      console.log(`\n${r.label.toUpperCase()}`);
      console.log('─'.repeat(60));
      console.log(`Weighted sum calculation:`);

      let calculation = [];
      for (const criterion of rubric.criteria) {
        const score = scores[criterion.id];
        const weight = criterion.weight;
        calculation.push(`(${score}×${weight})`);
      }
      console.log(`  ${calculation.join(' + ')}`);
      console.log(`  = ${weightedSum}`);
      console.log(`\nWeight sum: ${weightSum}`);
      console.log(`Fit score: (${weightedSum} / ${weightSum}) × 10 = ${fitScore}`);
      console.log(`\nFloors pass: ${floorsPass ? '✓' : '✗'}`);
      if (floorBreaches.length > 0) {
        console.log(`  Breaches: ${floorBreaches.join(', ')}`);
      }
      console.log(`Can unlock email: ${canUnlockEmail ? '✅ YES' : '❌ NO'}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════\n');
}

async function callJudge(chatHistory) {
  // Build transcript
  const transcript = chatHistory
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  // Build judge prompt
  const judgePrompt = `You are evaluating a hiring conversation against a rubric. The applicant is being assessed for fit with a live-in collaboration role focused on freedom, community, and alternative living.

RUBRIC:
${JSON.stringify(rubric.criteria, null, 2)}

CONVERSATION TRANSCRIPT:
${transcript}

YOUR TASK:
1. Score each criterion (1-10) based on the rubric score guides
2. Provide rationale (1-2 sentences explaining the scores)
3. Generate one coaching question to probe the weakest area

Return ONLY valid JSON. No markdown, no preamble. Start with { and end with }:
{
  "criteriaScores": { "depth-of-questioning": score, "self-awareness": score, "systems-thinking": score, "experimentation-evidence": score, "authenticity": score, "reciprocal-curiosity": score },
  "rationale": "...",
  "coachingQuestion": "..."
}`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.3,
    max_tokens: 500
  });

  const responseText = response.choices[0]?.message?.content;

  if (!responseText) {
    throw new Error('Empty response from Groq');
  }

  // Parse JSON response
  let parsed;
  try {
    // Try to extract JSON from response (in case of extra text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Raw response:', responseText);
    throw new Error(`Failed to parse judge response: ${e.message}`);
  }

  // Validate structure
  if (!parsed.criteriaScores || !parsed.rationale) {
    throw new Error('Judge response missing required fields');
  }

  return {
    rubricVersion: 'v1',
    criteriaScores: parsed.criteriaScores,
    rationale: parsed.rationale,
    coachingQuestion: parsed.coachingQuestion || null,
    timestamp: new Date().toISOString()
  };
}

// Run tests
runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
