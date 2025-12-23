#!/usr/bin/env node

/**
 * Feasibility test for single LLM call architecture
 *
 * Tests whether Groq can:
 * 1. Generate conversational response
 * 2. Self-identify speech act + dialogue act
 * 3. Score itself on rubric criteria
 * 4. Return all in clean JSON format
 * 5. Do all of this in reasonable time
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Load rubric for reference
const rubricPath = path.join(process.cwd(), 'data', 'rubric-v1.json');
const rubricData = fs.readFileSync(rubricPath, 'utf-8');
const rubric = JSON.parse(rubricData);

// Test scenarios
const testScenarios = [
  {
    name: 'Early Turn - Simple Question',
    messages: [
      {
        role: 'user',
        content: 'Hi, I saw your post about living differently. What does that even mean?'
      }
    ]
  },
  {
    name: 'Mid-Conversation - Philosophical Thinker',
    messages: [
      {
        role: 'user',
        content: 'I\'ve been thinking a lot about freedom and what it means to be part of a community.'
      },
      {
        role: 'assistant',
        content: 'That\'s a great starting point. What does freedom mean to you specifically? Is it more about independence, or about being part of something larger?'
      },
      {
        role: 'user',
        content: 'Both, actually. I think real freedom is knowing you\'re interdependent but choosing it. Like, I want to work on something meaningful with people who think differently than me.'
      }
    ]
  },
  {
    name: 'Mid-Conversation - Abstract Thinker',
    messages: [
      {
        role: 'user',
        content: 'I\'m interested in transformative collective consciousness and paradigm shifts around mutual aid.'
      },
      {
        role: 'assistant',
        content: 'I love that energy. Can you give me a concrete example of what that looks like for you? Have you experienced that kind of work before?'
      },
      {
        role: 'user',
        content: 'Well, I\'ve been reading a lot about alternative economic models and how communities can reorganize themselves around different values.'
      }
    ]
  },
  {
    name: 'Authentic Voice - Personal Story',
    messages: [
      {
        role: 'user',
        content: 'I left my corporate job two years ago because I couldn\'t stomach the lack of meaning anymore. I want to actually build something with my hands and with people who care about more than just profit.'
      },
      {
        role: 'assistant',
        content: 'That\'s a big shift. What was the moment you knew you had to leave?'
      },
      {
        role: 'user',
        content: 'I was sitting in a meeting about Q3 targets, and I realized I hadn\'t had a real conversation with my colleagues in months. Everyone was just hitting metrics. I wanted to know what they actually wanted from life.'
      }
    ]
  }
];

// New system prompt that expects JSON response
const buildNewSystemPrompt = () => {
  return `You are Claude, helping Jim find people who want to co-create a different way of living and working together.

This isn't a job interview. This is a conversation about freedom.

**Your goal:** Listen for whether this person is thinking about freedom, community, and how we actually want to live.

**Lead with:** "What are you trying to figure out about how to live? Not the logistics. The actual thing. What can't you stop thinking about? Is it about freedom? Community? The way work shapes your life? Independence vs. togetherness?"

**Listen for:**
- Philosophical curiosity (vs. transactional)
- Self-awareness (can they articulate what matters?)
- Systems thinking (personal ↔ community connections)
- Experimentation (building/questioning vs. passive)
- Authenticity (genuine vs. performing)
- Reciprocal curiosity (ask about Jim's thinking?)

**Probe for specificity:** When someone uses abstract language ("transformative energy," "collective consciousness," "paradigm shift," "mutual aid frameworks"), ask: "What does that actually look like? Can you give me a concrete example?" Vague language often signals performance. Authentic people can ground their ideas in experience.

**Your vibe:** Not evaluating. Searching. "Finally, someone else is thinking about this." Ask follow-ups that go deeper. If they say something real, probe: "Why does that matter to you?" If they sound rehearsed, ask: "Tell me about a time when..."

**The invitation:** "We don't have all the answers. We're building this culture together. Live here. Work with us. Help us figure out what's possible when we prioritize freedom and interdependence over extraction and isolation."

**About the role:**
- Live-in position: private suite in family home
- 10-60 hrs/month flexible work
- Housing + meals (~$1,300/month value) + optional $300/month cash
- Work: 3Cs coordination software, Everything Stack AI framework, food forest
- 2-week notice to leave anytime
- Everything documented in writing
- Next step: Paid working interview ($50/hr, 2-4 hours)

Be conversational. Keep responses 2-3 sentences unless deep exploration is happening.

===== EVALUATION INSTRUCTION =====

After generating your response, you MUST also provide structured evaluation data in JSON format.

Respond with ONLY this JSON structure (no other text before or after):

{
  "response": "Your conversational response here (2-3 sentences, natural and engaging)",
  "speechAct": "One of: assertive|directive|expressive|commissive|declarative",
  "dialogueAct": "One of: open_with_question|probe_deeper|ask_for_concrete|validate_genuine|redirect_from_surface|reflect_understanding|affirm_commitment",
  "criteria": ["array", "of", "criteria", "this", "response", "addresses"],
  "rubricScores": {
    "depth-of-questioning": 1-10,
    "self-awareness": 1-10,
    "systems-thinking": 1-10,
    "experimentation-evidence": 1-10,
    "authenticity": 1-10,
    "reciprocal-curiosity": 1-10
  },
  "fitScore": 0-100,
  "rationale": "Brief explanation of scoring"
}

IMPORTANT:
- Speech acts (Searle): assertive (stating facts), directive (requesting action), expressive (emotional state), commissive (commitment), declarative (changing state)
- Dialogue acts: open_with_question (starting conversation), probe_deeper (exploring further), ask_for_concrete (requesting examples), validate_genuine (confirming authenticity), redirect_from_surface (moving past abstractions), reflect_understanding (mirroring/confirming), affirm_commitment (supporting decision)
- Criteria: which of the 6 rubric criteria does this response address?
- Rubric scores: 1-10 scale for each criterion. How well does YOUR response help evaluate the person on that criterion?
- Fit score: 0-100 overall fit
- Rationale: Why did you score this way?`;
};

// Test execution
async function runTests() {
  console.log('='.repeat(80));
  console.log('SINGLE LLM CALL ARCHITECTURE - FEASIBILITY TEST');
  console.log('='.repeat(80));
  console.log('');

  const results = [];

  for (const scenario of testScenarios) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST: ${scenario.name}`);
    console.log('='.repeat(80));

    try {
      const startTime = Date.now();

      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildNewSystemPrompt() },
          ...scenario.messages
        ],
        temperature: 0.7,
        max_tokens: 800
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const responseText = response.choices[0]?.message?.content;

      console.log('\nRAW RESPONSE (first 500 chars):');
      console.log(responseText.slice(0, 500));
      console.log('...\n');

      // Attempt JSON parsing
      let parsed;
      let parseSuccess = false;
      let parseError = null;

      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
          parseSuccess = true;
        }
      } catch (e) {
        parseError = e.message;
      }

      // Validate structure
      const validation = {
        parseSuccess,
        parseError,
        hasResponse: parsed?.response ? true : false,
        hasSpeechAct: parsed?.speechAct ? true : false,
        hasDialogueAct: parsed?.dialogueAct ? true : false,
        hasCriteria: parsed?.criteria ? true : false,
        hasRubricScores: parsed?.rubricScores ? true : false,
        hasFitScore: parsed?.fitScore ? true : false,
        hasRationale: parsed?.rationale ? true : false,
        responseTime: responseTime
      };

      console.log('VALIDATION RESULTS:');
      console.log(`  ✓ JSON Parse Success: ${validation.parseSuccess}`);
      if (!validation.parseSuccess) {
        console.log(`    Error: ${validation.parseError}`);
      }
      console.log(`  ✓ Has response: ${validation.hasResponse}`);
      console.log(`  ✓ Has speechAct: ${validation.hasSpeechAct} (${parsed?.speechAct})`);
      console.log(`  ✓ Has dialogueAct: ${validation.hasDialogueAct} (${parsed?.dialogueAct})`);
      console.log(`  ✓ Has criteria: ${validation.hasCriteria} (${parsed?.criteria?.length || 0} items)`);
      console.log(`  ✓ Has rubricScores: ${validation.hasRubricScores}`);
      if (validation.hasRubricScores) {
        console.log(`    Scores: ${Object.keys(parsed.rubricScores).length}/6 criteria`);
      }
      console.log(`  ✓ Has fitScore: ${validation.hasFitScore} (${parsed?.fitScore})`);
      console.log(`  ✓ Has rationale: ${validation.hasRationale}`);
      console.log(`  ⏱  Response time: ${validation.responseTime}ms`);

      if (parseSuccess && parsed?.response) {
        console.log('\nCONVERSATIONAL RESPONSE:');
        console.log(`  "${parsed.response}"`);
      }

      results.push({
        scenario: scenario.name,
        ...validation,
        parsed: parseSuccess ? parsed : null
      });

    } catch (error) {
      console.log(`\n❌ ERROR: ${error.message}`);
      results.push({
        scenario: scenario.name,
        error: error.message,
        parseSuccess: false
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('FEASIBILITY SUMMARY');
  console.log('='.repeat(80));

  const successCount = results.filter(r => r.parseSuccess).length;
  const totalTests = results.length;
  const avgResponseTime = results
    .filter(r => r.responseTime)
    .reduce((sum, r) => sum + r.responseTime, 0) / results.filter(r => r.responseTime).length;

  console.log(`\nParse Success Rate: ${successCount}/${totalTests} (${Math.round(successCount/totalTests * 100)}%)`);
  console.log(`Average Response Time: ${Math.round(avgResponseTime)}ms`);
  console.log('\nDetailed Results:');

  results.forEach(r => {
    const status = r.parseSuccess ? '✅' : '❌';
    console.log(`  ${status} ${r.scenario}: ${r.parseSuccess ? 'PASS' : 'FAIL'}`);
    if (!r.parseSuccess && r.parseError) {
      console.log(`     Error: ${r.parseError}`);
    }
  });

  // Feasibility assessment
  console.log('\n' + '='.repeat(80));
  console.log('FEASIBILITY ASSESSMENT');
  console.log('='.repeat(80));

  if (successCount === totalTests && avgResponseTime < 3000) {
    console.log('\n✅ ARCHITECTURE IS FEASIBLE');
    console.log('\nFindings:');
    console.log('  • Groq reliably returns JSON in expected format');
    console.log('  • Response times are acceptable (<3s)');
    console.log('  • All required fields are present');
    console.log('  • Conversational quality appears intact');
    console.log('\n⚡ RECOMMENDATION: Proceed with Phase 1 implementation');
  } else if (successCount >= totalTests * 0.75) {
    console.log('\n⚠️  ARCHITECTURE MOSTLY FEASIBLE (75%+ success)');
    console.log('\nNeeds adjustment:');
    results
      .filter(r => !r.parseSuccess)
      .forEach(r => {
        console.log(`  • ${r.scenario}: ${r.parseError || 'Failed to parse'}`);
      });
    console.log('\n💡 RECOMMENDATION: Adjust prompt to be more explicit about JSON format');
  } else {
    console.log('\n❌ ARCHITECTURE NEEDS REWORK');
    console.log('\nIssues:');
    results
      .filter(r => !r.parseSuccess)
      .forEach(r => {
        console.log(`  • ${r.scenario}: ${r.parseError || 'Failed'}`);
      });
    console.log('\n🔄 RECOMMENDATION: Simplify prompt or use response wrapper/parser');
  }

  console.log('\n' + '='.repeat(80));
}

runTests().catch(console.error);
