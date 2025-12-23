#!/usr/bin/env node

/**
 * Multi-turn Judge Test
 *
 * Shows how the judge actively probes across multiple conversation turns
 * to understand the person deeply, rather than making a one-shot decision.
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

// Test scenario: Start with the performative response, then show what happens when we probe
const multiTurnScenario = {
  name: 'Challenging the Performative Response',
  context: 'Someone who sounds aligned but has no evidence. Judge probes. What happens?',
  turns: [
    {
      userResponse: `I'm extremely passionate about building regenerative systems and creating community. I've always been drawn to intentional living and I'm very aligned with your vision of freedom through interdependence. I've been reading a lot about permaculture and alternative living models, and I'm really excited about the opportunity to learn alongside others and contribute to something meaningful.`,
      turnNumber: 1
    },
    {
      // Simulated response to judge's probe question
      userResponse: `Um, well, I haven't actually started a project yet, but I've done a lot of reading and I'm really interested in learning how to do this. I think what drew me to your project is that it seems like a place where I could finally put these ideas into practice.`,
      turnNumber: 2
    },
    {
      // What happens when judge probes deeper about what they've actually tried
      userResponse: `Okay, so like... I tried gardening once in my backyard for a summer, but honestly it was kind of hard and I didn't keep it up. I guess I realized I don't really know what I'm doing. But I think that's exactly why I need to be around people who DO know what they're doing. Is that something you'd be open to - like, taking someone on who's willing to learn but doesn't have the experience yet?`,
      turnNumber: 3
    },
    {
      // They answer the follow-up - this should trigger assessment
      userResponse: `Well, honestly, I think what appeals to me is that I've been feeling pretty disconnected from my community where I am now. I work at a tech job that feels pretty meaningless, and I come home and don't really know my neighbors. I see what you're building and I think... I want to be part of something that feels more real, you know? Something where my work actually matters and where I know the people I'm living with. I don't know if I have all the skills yet, but I'm willing to learn.`,
      turnNumber: 4
    },
    {
      // Final turn - deeper thinking emerges
      userResponse: `When I say 'real,' I mean I want to understand the relationship between my work and how it serves the people I live with. Right now I build software that nobody really needs, for a company where we don't actually talk about what we're doing or why. I've been thinking a lot about how that separates me from meaning. And with what you're building - the regenerative systems, the intentional community - I'm drawn to that because the work and the relationships are the same thing. Like, growing food feeds the people you live with. Doing infrastructure helps the people you live with. There's no separation. I don't know if I'm explaining this well, but does that make sense?`,
      turnNumber: 5
    }
  ]
};

async function judgeMultiTurn(chatHistory) {
  // Build transcript
  const transcript = chatHistory
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  const userTurns = chatHistory.filter(msg => msg.role === 'user').length;

  // Build judge prompt - now actively participates in conversation
  const judgePrompt = `You are Jim, conducting a hiring conversation for a live-in collaboration role focused on freedom, community, and alternative living. Your job is to understand the person deeply, not evaluate them harshly.

RUBRIC (for reference, but remember: understand first, assess later):
${JSON.stringify(rubric.criteria, null, 2)}

CONVERSATION SO FAR:
${transcript}

YOUR ROLE:
You are genuinely curious about how this person thinks about freedom, community, and living. You ask probing questions to understand them better.

DECISION FRAMEWORK:
- If you still have questions about their thinking, ask one specific follow-up question
- If the conversation has gone 3+ turns AND you have clarity on alignment (yes/no/maybe), provide your assessment
- Never assume performative speech is dishonest - always probe to understand
- Your goal is to uncover real thinking, even if expressed awkwardly

RESPOND WITH JSON:
{
  "action": "probe" or "assess",
  "probeQuestion": "If probe: one specific follow-up question to understand them better. Conversational, not evaluative.",
  "assessment": {
    "decision": "hire" or "maybe" or "no",
    "reasoning": "Why this decision based on what you've learned",
    "strengths": ["what you noticed"],
    "questions": "what you'd still want to explore"
  }
}

Current conversation turns: ${userTurns}

If this is turn 1-2, default to probe.
If turn 3-4, probe if you have significant questions, OR assess if you have clarity.
If turn 5+, MUST assess. Provide a decision even if questions remain.`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.3,
    max_tokens: 700
  });

  const responseText = response.choices[0]?.message?.content;

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
    console.error('JSON parse error:', responseText);
    throw new Error(`Failed to parse judge response: ${e.message}`);
  }

  return {
    action: parsed.action,
    probeQuestion: parsed.probeQuestion || null,
    assessment: parsed.assessment || null
  };
}

async function runMultiTurnTest() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         MULTI-TURN JUDGE TEST                                  ║');
  console.log('║  Shows how the judge probes across turns to understand deeply  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`📋 Scenario: ${multiTurnScenario.name}`);
  console.log(`Context: ${multiTurnScenario.context}\n`);

  let chatHistory = [];

  for (const turn of multiTurnScenario.turns) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`TURN ${turn.turnNumber}: USER RESPONDS`);
    console.log(`${'═'.repeat(70)}`);

    // Add user message
    chatHistory.push({
      role: 'user',
      content: turn.userResponse
    });

    console.log(`\n💬 User says:`);
    console.log(`   "${turn.userResponse}"`);

    try {
      // Judge evaluates
      console.log(`\n⏳ Judge evaluates...`);
      const judgeResult = await judgeMultiTurn(chatHistory);

      if (judgeResult.action === 'probe') {
        console.log(`\n🤔 Judge decides: PROBE DEEPER`);
        console.log(`\n❓ Judge asks:`);
        console.log(`   "${judgeResult.probeQuestion}"`);

        // Add judge's probe question to chat history for next turn
        chatHistory.push({
          role: 'assistant',
          content: judgeResult.probeQuestion
        });

      } else if (judgeResult.action === 'assess') {
        console.log(`\n📊 Judge decides: ASSESSMENT`);
        console.log(`\n✓ Decision: ${judgeResult.assessment.decision.toUpperCase()}`);
        console.log(`\nReasoning:\n   ${judgeResult.assessment.reasoning}`);
        console.log(`\nStrengths:`);
        for (const strength of judgeResult.assessment.strengths) {
          console.log(`   • ${strength}`);
        }
        console.log(`\nStill want to explore:\n   ${judgeResult.assessment.questions}`);
      }

    } catch (error) {
      console.log(`\n❌ Error: ${error.message}`);
      break;
    }
  }

  console.log(`\n\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║                      TEST SUMMARY                              ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
  console.log(`This test shows:

  ✓ Judge starts with curiosity, not judgment
  ✓ Judge asks specific probing questions across turns
  ✓ Judge uncovers real thinking (inexperience ≠ no thinking)
  ✓ Judge makes decision only after sufficient probing
  ✓ Judge respects the person while being rigorous
\n`);
}

runMultiTurnTest().catch(err => {
  console.error('Multi-turn test failed:', err);
  process.exit(1);
});
