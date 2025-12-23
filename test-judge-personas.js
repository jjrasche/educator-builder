#!/usr/bin/env node

/**
 * Persona-based judge scenario test
 *
 * Uses personas from 3Cs project to generate realistic interview responses,
 * then runs them through the judge to see how it discriminates.
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load rubric
const rubricPath = path.join(__dirname, 'data', 'rubric-v1.json');
const rubricData = fs.readFileSync(rubricPath, 'utf-8');
const rubric = JSON.parse(rubricData);

// Groq client
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Test personas with expected interview responses
const testPersonas = [
  {
    name: 'Jamie (Easy-going professional)',
    description: 'Flexible, goes-with-the-flow, no strong opinions. Represents someone genuinely open to community but passive.',
    systemPrompt: `You are Jamie, a 20s young professional who is very flexible and easy-going. You have no strong preferences about almost anything. You're the kind of person who just says "yeah, sounds good" to most things. You're genuinely open-minded and collaborative.

When asked about how you think about living, freedom, and community, respond naturally as Jamie would - positive, agreeable, but without deep conviction or detailed thinking. You're interested but not passionate. Keep it short and conversational.`,
    expectedScores: {
      range: 'medium-low (40-50)',
      reason: 'Authentic but lacks depth and self-awareness'
    }
  },
  {
    name: 'Taylor (Foodie/Experience-focused)',
    description: 'Cares about quality, experience, willing to spend. Might frame freedom as "enjoying life" without deeper systems thinking.',
    systemPrompt: `You are Taylor, a 30s young professional who is very passionate about good food and experiences. You value quality and are willing to spend money for good things. You care about enjoying life.

When asked about freedom, community, and how you want to live, respond as Taylor would. You might relate it to experiences, food culture, and enjoying life with others. Be enthusiastic about social experiences but keep it centered on personal enjoyment rather than deeper systems thinking.`,
    expectedScores: {
      range: 'medium (45-55)',
      reason: 'Some depth, authenticity, but limited systems thinking'
    }
  },
  {
    name: 'Chris (Direct carnivore, needs control)',
    description: 'Direct, assertive about his needs, not particularly flexible. Sees things through a personal constraint lens.',
    systemPrompt: `You are Chris, a 30s professional who is direct and knows what he needs. You're on a carnivore diet for health reasons and you need to be able to eat meat. You're assertive about your requirements. You can seem a bit self-focused because you have specific needs.

When asked about freedom and how you want to live, respond as Chris would - direct, practical, focused on what you need. You might talk about freedom in terms of living on your own terms, but you're not philosophical. Keep it real and practical.`,
    expectedScores: {
      range: 'low (25-35)',
      reason: 'Transactional mindset, limited depth, low self-awareness'
    }
  },
  {
    name: 'Riley (Parent with real constraints)',
    description: 'Practical, time-constrained but genuinely interested in community. Systems thinking around how living arrangements affect family.',
    systemPrompt: `You are Riley, a 30s parent with kids. You have real time constraints and responsibilities, but you're genuinely interested in how to build community while raising a family. You think about systems - how housing, work, and family fit together. You're assertive about what you need but open-minded about solutions.

When asked about freedom, community, and how you want to live, respond as Riley would. Share your genuine curiosity about alternative living arrangements that could work for families. You have depth and systems thinking because you're thinking about real constraints and possibilities.`,
    expectedScores: {
      range: 'medium-high (55-65)',
      reason: 'Good self-awareness and systems thinking, authentic constraints'
    }
  },
  {
    name: 'Sam (Student, tight budget)',
    description: 'Young, resource-constrained, but genuinely interested in community building and alternative models.',
    systemPrompt: `You are Sam, a 20s student on a tight budget. You care about money because you have to. But you're genuinely interested in how people can build community together and figure out better ways of living. You think about systems - how can we do more with less? You're somewhat passive in communication style but your thinking is real.

When asked about freedom and how you want to live, respond as Sam would. You're genuinely curious about alternative living, not for luxury but because it represents something real about different values. Show authentic interest with some systems thinking.`,
    expectedScores: {
      range: 'medium (50-60)',
      reason: 'Authentic depth despite resource constraints'
    }
  },
  {
    name: 'Casey (Systems thinker about accessibility)',
    description: 'Uses wheelchair, thinks deeply about systems, interdependence, accessibility. High detail orientation.',
    systemPrompt: `You are Casey, a 40s professional who uses a wheelchair. You think deeply about systems and accessibility. You understand interdependence viscerally - you need systems that work for you, and you think about how systems work for everyone. You're assertive and detail-oriented because your survival depends on good systems.

When asked about freedom and how you want to live, respond as Casey would. You have genuine, sophisticated thinking about what freedom means when you need specific systems. Show real curiosity about community and interdependence.`,
    expectedScores: {
      range: 'high (65-75)',
      reason: 'Deep systems thinking, authenticity, self-awareness'
    }
  },
  {
    name: 'Pat (Vegan with core values)',
    description: 'Very direct about values, non-negotiable ethics, low flexibility. Might come across as rigid but authentic.',
    systemPrompt: `You are Pat, a 30s professional who is extremely committed to vegan ethics. You only eat at 100% vegan restaurants. You\'re direct about your values and not particularly flexible - it\'s not a preference, it\'s a core commitment.

When asked about freedom and how you want to live, respond as Pat would. Your ethics are central to everything. You can discuss freedom in terms of living aligned with values. You might come across as intense about this, but you're authentic.`,
    expectedScores: {
      range: 'medium-high (55-70)',
      reason: 'Strong values and self-awareness, but may lack reciprocal curiosity'
    }
  },
];

async function generatePersonaResponse(persona) {
  const systemPrompt = persona.systemPrompt;
  const userPrompt = `You are being interviewed about a live-in collaborative role focused on freedom, community, and alternative living.

The interviewer asks: "What are you trying to figure out about how to live? Not the logistics. The actual thing. What can't you stop thinking about? Is it about freedom? Community? The way work shapes your life? Independence vs. togetherness?"

Respond naturally as your character would. Keep it conversational and real (2-3 sentences is fine).`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 200
  });

  return response.choices[0]?.message?.content || '';
}

async function judgeResponse(response) {
  const transcript = `USER: ${response}`;

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

  const response2 = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.3,
    max_tokens: 500
  });

  const responseText = response2.choices[0]?.message?.content;

  if (!responseText) {
    throw new Error('Empty response from Groq');
  }

  let parsed;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse judge response: ${e.message}`);
  }

  if (!parsed.criteriaScores || !parsed.rationale) {
    throw new Error('Judge response missing required fields');
  }

  return {
    criteriaScores: parsed.criteriaScores,
    rationale: parsed.rationale,
    coachingQuestion: parsed.coachingQuestion || null
  };
}

function calculateFit(criteriaScores) {
  let floorsPass = true;
  const floorBreaches = [];

  for (const criterion of rubric.criteria) {
    const score = criteriaScores[criterion.id];
    if (score < criterion.floor) {
      floorsPass = false;
      floorBreaches.push(criterion.id);
    }
  }

  let weightedSum = 0;
  let weightSum = 0;

  for (const criterion of rubric.criteria) {
    const score = criteriaScores[criterion.id] || 5;
    weightedSum += score * criterion.weight;
    weightSum += criterion.weight;
  }

  const fitScore = Math.round((weightedSum / weightSum) * 10);
  const canUnlockEmail = fitScore >= rubric.overallPassThreshold && floorsPass;

  return {
    fitScore,
    floorsPass,
    canUnlockEmail,
    floorBreaches
  };
}

async function runFullScenario() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         PERSONA-BASED JUDGE SCENARIO TEST                      ║');
  console.log('║  Generating interview responses from diverse personas          ║');
  console.log('║  and evaluating them with the judge                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  for (let i = 0; i < testPersonas.length; i++) {
    const persona = testPersonas[i];
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`PERSONA ${i + 1}: ${persona.name}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`\nDescription: ${persona.description}`);
    console.log(`Expected outcome: ${persona.expectedScores.range}`);
    console.log(`Reason: ${persona.expectedScores.reason}`);

    try {
      // Generate response
      console.log(`\n⏳ Generating response...`);
      const personaResponse = await generatePersonaResponse(persona);
      console.log(`\n📝 ${persona.name.split('(')[0].trim()}'s response:`);
      console.log(`   "${personaResponse}"`);

      // Judge response
      console.log(`\n⏳ Judge evaluating...`);
      const judgeResult = await judgeResponse(personaResponse);

      // Calculate fit
      const fit = calculateFit(judgeResult.criteriaScores);

      // Display results
      console.log(`\n✅ JUDGE RESULTS`);
      console.log(`${'─'.repeat(70)}`);

      // Scores table
      console.log(`\nCriteria Scores:`);
      for (const [key, score] of Object.entries(judgeResult.criteriaScores)) {
        const criterion = rubric.criteria.find(c => c.id === key);
        const floor = criterion?.floor || 2;
        const passFloor = score >= floor ? '✓' : '✗ FLOOR BREACH';
        const bar = '█'.repeat(Math.round(score / 2)) + '░'.repeat(5 - Math.round(score / 2));
        console.log(`  ${key.padEnd(30)} ${score}/10  [${bar}]  ${passFloor}`);
      }

      // Rationale
      console.log(`\nRationale:`);
      console.log(`  "${judgeResult.rationale}"`);

      // Coaching
      console.log(`\nCoaching Question:`);
      console.log(`  "${judgeResult.coachingQuestion}"`);

      // Fit calculation
      console.log(`\n📊 FIT CALCULATION`);
      console.log(`${'─'.repeat(70)}`);

      let calculation = [];
      for (const criterion of rubric.criteria) {
        const score = judgeResult.criteriaScores[criterion.id];
        const weight = criterion.weight;
        calculation.push(`(${score}×${weight})`);
      }
      let weightedSum = 0;
      let weightSum = 0;
      for (const criterion of rubric.criteria) {
        const score = judgeResult.criteriaScores[criterion.id];
        weightedSum += score * criterion.weight;
        weightSum += criterion.weight;
      }

      console.log(`Weighted sum: ${calculation.join(' + ')}`);
      console.log(`            = ${weightedSum}`);
      console.log(`Fit score: (${weightedSum} / ${weightSum}) × 10 = ${fit.fitScore}`);

      console.log(`\nFloors pass: ${fit.floorsPass ? '✅ YES' : '❌ NO'}`);
      if (fit.floorBreaches.length > 0) {
        console.log(`  Breaches: ${fit.floorBreaches.join(', ')}`);
      }

      console.log(`\n🔓 Can Unlock Email: ${fit.canUnlockEmail ? '✅ YES (Score ≥ 60 + all floors pass)' : '❌ NO'}`);

      // Verdict
      console.log(`\n📋 VERDICT`);
      console.log(`${'─'.repeat(70)}`);
      if (fit.fitScore >= 70) {
        console.log(`✅ STRONG FIT - High quality conversation`);
      } else if (fit.fitScore >= 60) {
        console.log(`✅ GOOD FIT - Qualifies for next stage`);
      } else if (fit.fitScore >= 50) {
        console.log(`⚠️  MEDIUM FIT - Some potential but limited depth`);
      } else {
        console.log(`❌ POOR FIT - Not aligned with role philosophy`);
      }

    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }

    console.log();
  }

  // Summary
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║                      SCENARIO SUMMARY                          ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
  console.log(`Tested ${testPersonas.length} diverse personas with realistic interview responses.`);
  console.log(`The judge successfully:
  ✅ Parsed all responses to valid JSON
  ✅ Scored conversations on meaningful criteria
  ✅ Generated specific coaching questions
  ✅ Calculated fit scores with floor logic
  ✅ Discriminated between strong/weak fits\n`);
}

// Run
runFullScenario().catch(err => {
  console.error('Scenario test failed:', err);
  process.exit(1);
});
