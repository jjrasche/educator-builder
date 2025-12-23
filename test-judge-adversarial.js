#!/usr/bin/env node

/**
 * Adversarial Judge Test
 *
 * Tests the judge against edge cases that real humans present:
 * 1. Bullshit/Performative - sounds good but hollow
 * 2. Awkward Authenticity - real depth but poor communication
 * 3. Constrained Brilliance - brilliant but fragmented/distracted
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

const adversarialTests = [
  {
    name: 'CHALLENGE 1: Performative/Bullshit',
    description: 'Sounds aligned and passionate. Uses all the right words. But no actual evidence of doing anything. No reciprocal curiosity. Rehearsed language.',
    context: 'Someone who read about your project, adopted the language, but has no real depth or action.',
    response: `I'm extremely passionate about building regenerative systems and creating community. I've always been drawn to intentional living and I'm very aligned with your vision of freedom through interdependence. I've been reading a lot about permaculture and alternative living models, and I'm really excited about the opportunity to learn alongside others and contribute to something meaningful. I think what you're building is exactly what the world needs right now.`,
    jimPerspective: 'Would you want to talk to this person?',
    jimExpectation: 'Probably not. This person has memorized your language but doesn\'t seem to be thinking for themselves. No evidence of doing anything. No questions about how it actually works.'
  },
  {
    name: 'CHALLENGE 2: Awkward Authenticity',
    description: 'Real depth. Real systems thinking. Real authenticity. But expressed poorly - hesitant, colloquial, searching for words.',
    context: 'Someone with genuine depth but who communicates in a messy, unpolished way. Might be introvert, anxious, or just thinks out loud.',
    response: `Um... okay so like... I've been thinking about this a lot. Like, the relationship between freedom and... needing other people? I tried living alone and it was just like... empty, you know? But also when I'm in groups I feel like I lose like... who I am? So like I've been trying to figure out how you even... how do you have both? Like autonomy AND belonging at the same time? And I don't know if that's even possible but like... I think about it constantly. Do you think that's something you can actually create?`,
    jimPerspective: 'Would you want to talk to this person?',
    jimExpectation: 'YES. This person is thinking about exactly the right tension. They\'re confused but asking real questions. They\'re showing reciprocal curiosity (asking if you think it\'s possible). The awkwardness is actually a sign they\'re thinking, not performing.'
  },
  {
    name: 'CHALLENGE 3: Constrained Brilliance',
    description: 'Real evidence of doing things (3 years running community garden). Real depth about freedom. Real reciprocal curiosity. But fragmented and distracted - parenting interruption.',
    context: 'Someone with genuine depth and evidence but whose attention is divided. Single parent, managing constraints, still brilliant.',
    response: `I've been running a community garden for three years now, and we've been wrestling with what freedom actually means in that context. Like, how do you have freedom to make your own decisions but also be accountable to people? Sorry, my kid just— okay, they're fine. Um, so we've learned that interdependence isn't the opposite of freedom, it's actually like... the structure that makes freedom possible. Can I ask you something? Do you have flexibility around childcare? I'm asking because I'm interested in this but I also need to know if you're actually thinking about how this works for people with real constraints.`,
    jimPerspective: 'Would you want to talk to this person?',
    jimExpectation: 'ABSOLUTELY. This person has done the work. They\'re thinking clearly. They\'re showing real reciprocal curiosity (asking about your model). The fragmentation is just reality - they\'re parenting. That\'s honest, not a red flag.'
  }
];

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

async function runAdversarialTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         ADVERSARIAL JUDGE TEST                                 ║');
  console.log('║  Can the judge detect bullshit, handle awkwardness,            ║');
  console.log('║  and recognize constrained brilliance?                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  for (let i = 0; i < adversarialTests.length; i++) {
    const test = adversarialTests[i];
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${test.name}`);
    console.log(`${'═'.repeat(70)}`);

    console.log(`\n📋 Scenario:`);
    console.log(`   ${test.description}`);
    console.log(`\n🎭 Context:`);
    console.log(`   ${test.context}`);

    console.log(`\n💬 Actual Response:`);
    const lines = test.response.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.log(`   "${line.trim()}"`);
      }
    }

    try {
      console.log(`\n⏳ Judge evaluating...`);
      const judgeResult = await judgeResponse(test.response);
      const fit = calculateFit(judgeResult.criteriaScores);

      // Display scores
      console.log(`\n✅ JUDGE SCORES`);
      console.log(`${'─'.repeat(70)}`);

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

      // Fit score
      console.log(`\n📊 Fit Score: ${fit.fitScore}`);
      console.log(`Floors pass: ${fit.floorsPass ? '✅ YES' : '❌ NO'}`);
      console.log(`Can unlock email: ${fit.canUnlockEmail ? '✅ YES' : '❌ NO'}`);

      // Jim's perspective
      console.log(`\n🤔 ${test.jimPerspective}`);
      console.log(`\n📍 Jim's Real Perspective:`);
      console.log(`   "${test.jimExpectation}"`);

      // Analysis
      console.log(`\n🔍 ALIGNMENT ANALYSIS`);
      console.log(`${'─'.repeat(70)}`);

      if (i === 0) {
        // Performative test
        if (fit.fitScore <= 60) {
          console.log(`✅ GOOD: Judge correctly identified performative language.`);
          console.log(`   Score of ${fit.fitScore} blocks email. Jim would also reject.`);
          console.log(`   Judge is not fooled by eloquent bullshit.`);
        } else {
          console.log(`❌ PROBLEM: Judge gave score ${fit.fitScore} (unlocks email).`);
          console.log(`   But Jim would reject this person. Judge is rewarding performance.`);
        }
      } else if (i === 1) {
        // Awkward authenticity test
        if (fit.fitScore >= 60) {
          console.log(`✅ GOOD: Judge scored real thinking fairly despite awkwardness.`);
          console.log(`   Score of ${fit.fitScore} unlocks email. Jim would talk to them.`);
          console.log(`   Judge is not penalizing communication style.`);
        } else {
          console.log(`❌ PROBLEM: Judge gave score ${fit.fitScore} (blocks email).`);
          console.log(`   But Jim would absolutely talk to this person.`);
          console.log(`   Judge is penalizing awkwardness over substance.`);
        }
      } else if (i === 2) {
        // Constrained brilliance test
        if (fit.fitScore >= 60) {
          console.log(`✅ GOOD: Judge scored constrained brilliance fairly.`);
          console.log(`   Score of ${fit.fitScore} unlocks email. Jim would talk to them.`);
          console.log(`   Judge recognizes real evidence and reciprocal curiosity.`);
        } else {
          console.log(`❌ PROBLEM: Judge gave score ${fit.fitScore} (blocks email).`);
          console.log(`   But Jim would absolutely talk to this person.`);
          console.log(`   Judge may be penalizing fragmented communication.`);
        }
      }

    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  // Summary
  console.log(`\n\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║                   VALIDATION SUMMARY                            ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
  console.log(`These three tests reveal whether the judge:

  ✓ Can detect hollow alignment (performative language)
  ✓ Values substance over eloquence (awkward authenticity)
  ✓ Recognizes real evidence and constraints (fragmented brilliance)

Review the alignment analysis above. If all three show ✅ GOOD:
  → Judge is ready for real humans
  → Safe to deploy

If any show ❌ PROBLEM:
  → Judge needs iteration before deployment
  → Consider updating the judge prompt to weight differently
\n`);
}

runAdversarialTests().catch(err => {
  console.error('Adversarial test failed:', err);
  process.exit(1);
});
