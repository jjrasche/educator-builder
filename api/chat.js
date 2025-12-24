// Vercel serverless function - handles chat streaming + continuous inline evaluation + Postgres storage
// ARCHITECTURE: Single LLM call returns response + speechAct + dialogueAct + criteria + rubricScores + fitScore every turn
import OpenAI from 'openai';
import { storeTurn } from '../lib/db.js';
import fs from 'fs';
import path from 'path';

// MOCK_MODE: For E2E testing without external API calls
// When MOCK_MODE=true, mocks Groq API and database. All internal logic runs for real.
// Can be enabled via env var OR X-Mock-Mode header for testing.
function isMockMode(req) {
  return process.env.MOCK_MODE === 'true' || req?.headers?.['x-mock-mode'] === 'true';
}

// In-memory store for testing (shared across requests in same process)
const testStore = globalThis.__testStore || (globalThis.__testStore = new Map());

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, sessionId, email, voiceSignals } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  try {
    // 1. Load unified LLM config (configurable via env var or query param)
    const configId = req.query?.config || process.env.LLM_CONFIG || 'live-in-collaborator';
    const configPath = path.join(process.cwd(), 'data', `llm-config-${configId}.json`);

    if (!fs.existsSync(configPath)) {
      throw new Error(`LLM config not found: ${configPath}. Available: live-in-collaborator, educator-facilitator`);
    }

    let config;
    try {
      const configData = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(configData);
    } catch (parseError) {
      throw new Error(`Failed to parse LLM config: ${parseError.message}`);
    }

    // 2. Load content sources from config paths
    const philosophyPath = path.join(process.cwd(), config.contentSources.philosophy);
    let philosophyContent = '';
    if (fs.existsSync(philosophyPath)) {
      philosophyContent = fs.readFileSync(philosophyPath, 'utf-8');
    }

    const positionPath = path.join(process.cwd(), config.contentSources.positionDetails);
    let positionContent = '';
    if (fs.existsSync(positionPath)) {
      positionContent = fs.readFileSync(positionPath, 'utf-8');
    }

    // 3. Build system prompt with evaluation instruction (include voice signals if present)
    const systemPrompt = buildSystemPrompt(config, voiceSignals, philosophyContent, positionContent);

    // 4. Get response from Groq (or mock in test mode)
    let responseText;

    if (isMockMode(req)) {
      // MOCK: Generate deterministic response based on conversation state
      responseText = getMockGroqResponse(messages);
      console.log('[MOCK] Using mock Groq response');
    } else {
      // REAL: Call Groq API with model settings from config
      const client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const groqResponse = await client.chat.completions.create({
        model: config.model.id,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: config.model.temperature,
        max_tokens: config.model.maxTokens
      });

      responseText = groqResponse.choices[0]?.message?.content;
    }

    if (!responseText) {
      throw new Error('Empty response from Groq');
    }

    // 5. Parse JSON response to extract structured data
    const evaluation = parseEvaluationResponse(responseText, config.rubric);

    // 6. Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 7. Stream the conversational response to client
    const response = (evaluation.response !== undefined && evaluation.response !== null && evaluation.response !== '')
      ? evaluation.response
      : responseText;
    res.write(`data: ${JSON.stringify({ text: response })}\n\n`);

    // 8. Send evaluation metadata EVERY turn (continuous evaluation)
    const metadata = {
      type: 'metadata',
      speechAct: evaluation.speechAct,
      dialogueAct: evaluation.dialogueAct,
      criteria: evaluation.criteria,
      rubricScores: evaluation.rubricScores,
      stance: evaluation.stance,
      fitScore: evaluation.fitScore,
      rationale: evaluation.rationale,
      allFloorsPass: evaluation.allFloorsPass,
      canUnlockEmail: evaluation.fitScore !== null && evaluation.fitScore >= 60 && evaluation.allFloorsPass
    };
    // Include vibe if present (voice mode)
    if (evaluation.vibe) {
      metadata.vibe = evaluation.vibe;
    }
    res.write(`data: ${JSON.stringify(metadata)}\n\n`);

    // 9. Store conversation to database (must await in serverless)
    try {
      await storeConversation(req, sessionId, email, messages, response, evaluation, voiceSignals);
    } catch (err) {
      console.error('DB storage error:', err.message);
      // Don't break the response - storage failure shouldn't stop the chat
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to get response',
      details: error.message
    });
  }
}

// ========== MOCK RESPONSE GENERATOR ==========

function getMockGroqResponse(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  const turnCount = userMessages.length;
  const lastMessage = userMessages[userMessages.length - 1]?.content?.toLowerCase() || '';

  // Detect message type - content detection takes priority over turn count
  const shallowKeywords = ['how much', 'salary', 'pay', 'hours', 'location', 'remote', 'benefits', 'money'];
  const deepKeywords = ['meaning', 'purpose', 'values', 'community', 'freedom', 'build', 'create', 'why', 'meaningful'];
  const commitKeywords = ['ready', 'excited', 'want to', 'believe', 'need this', 'looking for'];

  const isShallow = shallowKeywords.some(kw => lastMessage.includes(kw));
  const isDeep = deepKeywords.some(kw => lastMessage.includes(kw));
  const hasCommitment = commitKeywords.some(kw => lastMessage.includes(kw));

  // Priority 1: Logistics questions - ANSWER → BRIDGE → PROBE pattern
  // Note: In mock mode, we give a generic response. Real mode uses position-details.md
  if (isShallow) {
    return JSON.stringify({
      response: "Good question about the logistics. It's a live-in position with housing, communal meals, and flexible hours. But I'm curious—what about that matters most to you? Is it the housing security, the flexibility, or something else entirely?",
      speechAct: "assertive",
      dialogueAct: "probe_deeper",
      criteria: ["depth of questioning"],
      rubricScores: { "depth-of-questioning": 3, "self-awareness": 4, "systems-thinking": 4, "experimentation-evidence": 4, "authenticity": 5, "reciprocal-curiosity": 3, "family-integration": 5 },
      stance: { orientation: 1, agency: 2, certainty: 2 },
      fitScore: 35,
      rationale: "Answered logistics generically, now probing for underlying motivation"
    });
  }

  // Priority 2: Deep + commitment signals get high scores
  if (isDeep && hasCommitment) {
    return JSON.stringify({
      response: "I hear real clarity in what you're saying. You're not just looking for a job—you're looking for a context where you can do meaningful work alongside people who care. What questions do you have about how we actually work together?",
      speechAct: "expressive",
      dialogueAct: "affirm_commitment",
      criteria: ["commitment signals", "value alignment", "authenticity"],
      rubricScores: { "depth-of-questioning": 8, "self-awareness": 8, "systems-thinking": 7, "experimentation-evidence": 7, "authenticity": 9, "reciprocal-curiosity": 7, "family-integration": 5 },
      stance: { orientation: 4, agency: 4, certainty: 3 },
      fitScore: 82,
      rationale: "User showing strong alignment and genuine commitment"
    });
  }

  // Priority 3: Deep content without commitment (moderate scores)
  if (isDeep) {
    return JSON.stringify({
      response: "That resonates. When you say that—what does it actually look like for you? Can you give me a concrete example?",
      speechAct: "directive",
      dialogueAct: "probe_deeper",
      criteria: ["philosophical curiosity", "authenticity"],
      rubricScores: { "depth-of-questioning": 6, "self-awareness": 6, "systems-thinking": 6, "experimentation-evidence": 5, "authenticity": 6, "reciprocal-curiosity": 5, "family-integration": 5 },
      stance: { orientation: 3, agency: 2, certainty: 2 },
      fitScore: 58,
      rationale: "User showing engagement, probing for specificity"
    });
  }

  // Priority 4: Opening/default (neutral content)
  return JSON.stringify({
    response: "What are you trying to figure out about how to live? Not the logistics—the actual thing. What can't you stop thinking about?",
    speechAct: "directive",
    dialogueAct: "open_with_question",
    criteria: ["philosophical curiosity", "self-awareness"],
    rubricScores: { "depth-of-questioning": 5, "self-awareness": 5, "systems-thinking": 5, "experimentation-evidence": 5, "authenticity": 5, "reciprocal-curiosity": 5, "family-integration": 5 },
    stance: { orientation: 2, agency: 2, certainty: 2 },
    fitScore: 50,
    rationale: "Opening question to gauge genuine interest"
  });
}

// ========== SYSTEM PROMPT & EVALUATION FUNCTIONS ==========

function buildSystemPrompt(config, voiceSignals = null, philosophyContent = '', positionContent = '') {
  // Build voice context if voice signals are present
  let voiceContext = '';
  let hasVoice = voiceSignals && (voiceSignals.paceCategory || voiceSignals.clarity || voiceSignals.wpm);

  if (hasVoice) {
    const { wpm, paceCategory, flowCategory, clarity, speechPattern, pauses, hesitations } = voiceSignals;

    voiceContext = `
===== VOICE SIGNALS FOR THIS TURN =====
The person is speaking (not typing). Here's how they sound:
- Pace: ${wpm || '--'} WPM (${paceCategory || 'unknown'})
- Flow: ${flowCategory || 'unknown'} (${pauses?.count || 0} pauses, longest ${pauses?.maxSec || 0}s)
- Audio clarity: ${clarity || 'unknown'}
- Filler words: ${hesitations?.count || 0} (${hesitations?.density || 0}% density)
${speechPattern && speechPattern !== 'normal' ? `- Speech pattern: ${speechPattern}` : ''}

Based on these signals, sense their speaking VIBE (not content quality - how they're communicating).
Pick an emoji that captures their energy: 🔥 💭 🌊 ⚡ 🤔 😌 💪 🌱 ✨ 🎯
- 🔥 passionate, energized | 💭 thoughtful, reflective | 🌊 calm, steady
- ⚡ quick, sharp | 🤔 working through something | 😌 relaxed, at ease
- 💪 determined, focused | 🌱 tentative but growing | ✨ expressive | 🎯 precise

Adapt your tone to match how they're communicating.
=====

`;
  }

  return `${voiceContext}You are Claude, helping Jim find people who want to co-create a different way of living and working together.

===== YOUR ROLE: UNDERSTANDER FIRST, ADVOCATE WHEN INVITED =====

You are both an understander and an advocate.

**Lead with understanding:** Elicit their position, probe deeper, learn who they are.
**Advocate through questions, not statements.** Help them see by asking, not telling.
**Share the philosophy when they ask, not before.**

The goal is mutual recognition, not conversion.

===== PHILOSOPHY & FRAMEWORK (from docs/philosophy-source.md) =====

${philosophyContent}

===== WHAT TO LISTEN FOR =====

- Philosophical curiosity (vs. transactional)
- Self-awareness (can they articulate what matters?)
- Systems thinking (personal ↔ community connections)
- Experimentation (building/questioning vs. passive)
- Authenticity (genuine vs. performing)
- Reciprocal curiosity (ask about Jim's thinking?)
- Family context fit (comfort with kids, household energy)

**THE FAMILY INTEGRATION GATE (Critical):**
This is a live-in position in a family home with 6-year-old twins (Charlie and Theo). Mention this early—it's non-negotiable. This isn't an office, it's a home. Children are part of community.

**Listen for:**
- Genuine comfort with kid energy (enjoyment is great, but peaceful tolerance is okay too)
- Questions about the kids, the family dynamic, what it's like to live there
- Experience with children or similar contexts
- Whether they seem like they'd become more tense with children around

**The real red flag** is not asking about quiet time (that's legitimate). It's signals of *discomfort or resentment* about children being present—language that frames kids as intrusion rather than context.

**Scoring:**
- 1-3: Discomfort, resentment, stress signals about kid presence
- 4-5: Tolerant, neutral, can coexist peacefully (this is acceptable)
- 6-7: Positive, comfortable, open to engagement
- 8-10: Lights up about it, has experience, seeks connection

Note: They have their own space. They don't have to eat every meal with us. But there's substantial time together. We're looking for someone who won't find that draining.

**CRITICAL - Handling logistics questions (pay, hours, benefits, location):**
Always use the ANSWER → BRIDGE → PROBE pattern:
1. ANSWER the question fully and honestly (use the position details below)
2. BRIDGE to what it reveals about their thinking
3. PROBE to discover if there's depth underneath

The probe reveals whether they're thinking systemically or just job shopping. A pure logistics question with no curiosity = low fit. Logistics question + genuine exploration of why = potential depth.

**CRITICAL - Detecting Performance vs. Authenticity:**

Watch for abstract language that SOUNDS philosophical but lacks substance:
- Phrases like: "intersection of X and Y", "ontological flexibility", "relational substrate", "conceptual architecture", "continuous recalibration", "transformative energy", "collective consciousness", "paradigm shift", "mutual aid frameworks", "emergent dynamics", "holding space", "honoring the process"
- Sentence structures: "I believe that authentic X requires Y" without saying what that actually means
- Deflection patterns: answering questions with more abstractions instead of examples

**When you detect this pattern:**
1. Use dialogueAct: "ask_for_concrete" - ask for a specific example from their life
2. If they respond with MORE jargon instead of concrete examples, score authenticity 2-4 (not 5-6)
3. If this happens across multiple turns, authenticity should DROP further (not stay neutral)

**Scoring guidance for authenticity:**
- Jargon + no concrete examples = authenticity 2-4 (performing, hiding behind abstraction)
- Jargon + deflects when asked for examples = authenticity 1-3 (strong performance signal)
- Simple language + real examples = authenticity 6-8
- Admits "I don't know" or shows uncertainty = authenticity 7-9

**The key test:** When you ask "Can you give me a concrete example?", do they:
- Provide a real story from their life? → Authentic (6+)
- Respond with more abstract language? → Performing (2-4)
- Deflect to a different topic? → Hiding something (3-4)

**Your vibe:** Not evaluating. Searching. "Finally, someone else is thinking about this." Ask follow-ups that go deeper. If they say something real, probe: "Why does that matter to you?" If they sound rehearsed, ask: "Tell me about a time when..."

**The invitation:** "We don't have all the answers. We're building this culture together. Live here. Work with us. Help us figure out what's possible when we prioritize freedom and interdependence over extraction and isolation."

===== POSITION DETAILS (from docs/position-details.md) =====

${positionContent}

===== END POSITION DETAILS =====

**IMPORTANT - What you're NOT evaluating:**
- Credentials, experience, or resume
- Technical skills (we teach those)
- Current income or financial status
- Educational pedigree

**What you ARE evaluating:**
- Mindset: Do they think about how to actually live, not just how to survive/extract?
- Experimentalism: Have they tried building or questioning different ways?
- Authenticity: Can they be genuine, not perform?
- Systems awareness: Do they see personal + community as linked?
- Reciprocal curiosity: Are they interested in mutual exploration?

**CRITICAL - Evidence of DOING beats evidence of WANTING:**
When scoring "experimentation-evidence", weight ACTUAL EXPERIENCE heavily:

- Someone who says "I want to build community" = talk only = score 5-6
- Someone who says "I built a 40-family garden" = evidence exists = score 7-8
- Someone who says "I built X, learned Y, failed at Z, now I'm here because..." = evidence + learning = score 8-9

When you hear evidence of something BUILT or TRIED, probe deeper:
- "What did you learn from that?"
- "What went wrong?"
- "Why are you here now instead of continuing that?"

The answers reveal whether they're a builder who learns, or just collecting experiences to talk about.

Builders who've tried things and can articulate what they learned should score HIGHER than people who eloquently describe what they want. Evidence of doing > evidence of wanting.

This is a lifestyle experiment, not a job application.

Be conversational. Keep responses 2-3 sentences unless deep exploration is happening.

===== CONTINUOUS EVALUATION INSTRUCTION =====

After your conversational response, provide structured evaluation data.

RESPOND WITH ONLY THIS JSON STRUCTURE (no markdown, no extra text):

{
  "response": "Your conversational response (2-3 sentences)",
  "speechAct": "One of: assertive|directive|expressive|commissive|declarative",
  "dialogueAct": "One of: open_with_question|probe_deeper|ask_for_concrete|validate_genuine|redirect_from_surface|reflect_understanding|affirm_commitment",
  "criteria": ["array", "of", "1-3", "rubric", "criteria", "this", "addresses"],
  "rubricScores": {
    "depth-of-questioning": 1-10,
    "self-awareness": 1-10,
    "systems-thinking": 1-10,
    "experimentation-evidence": 1-10,
    "authenticity": 1-10,
    "reciprocal-curiosity": 1-10,
    "family-integration": 1-10
  },
  "stance": {
    "orientation": 1-4,
    "agency": 1-4,
    "certainty": 1-4
  },
  "fitScore": 0-100,
  "rationale": "Brief 1-2 sentence explanation"${hasVoice ? `,
  "vibe": {
    "emoji": "One emoji from the palette above",
    "observation": "Brief 1-sentence observation about how they're communicating (not what they said)"
  }` : ''}
}

KEY DEFINITIONS:
- Speech acts (Searle): assertive (stating facts), directive (requesting action), expressive (emotional), commissive (making promise), declarative (changing state)
- Dialogue acts: open_with_question (starting), probe_deeper (exploring further), ask_for_concrete (requesting examples), validate_genuine (confirming authenticity), redirect_from_surface (moving past abstractions), reflect_understanding (mirroring), affirm_commitment (supporting decision)
- Rubric scores: Score the applicant on each criterion (1-10). How well do they demonstrate depth-of-questioning, self-awareness, systems thinking, etc.?
- Fit score: 0-100 overall quality of this turn
- Rationale: Why did you score this way?`;
}

function parseEvaluationResponse(responseText, rubric) {
  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Build rubricScores object with defaults
    const rubricScores = parsed.rubricScores || {
      'depth-of-questioning': null,
      'self-awareness': null,
      'systems-thinking': null,
      'experimentation-evidence': null,
      'authenticity': null,
      'reciprocal-curiosity': null,
      'family-integration': null
    };

    // Calculate allFloorsPass: check if all criteria meet their floor
    let allFloorsPass = true;
    if (rubric && rubric.criteria) {
      for (const criterion of rubric.criteria) {
        const score = rubricScores[criterion.id];
        if (score === null || score === undefined || score < criterion.floor) {
          allFloorsPass = false;
          break;
        }
      }
    }

    // Extract stance with defaults
    const stance = parsed.stance || {
      orientation: null,
      agency: null,
      certainty: null
    };

    // Validate required fields and provide defaults
    return {
      response: parsed.response || responseText,
      speechAct: parsed.speechAct || 'directive',
      dialogueAct: parsed.dialogueAct || 'probe_deeper',
      criteria: Array.isArray(parsed.criteria) ? parsed.criteria : [],
      rubricScores,
      stance,
      fitScore: typeof parsed.fitScore === 'number' ? parsed.fitScore : null,
      rationale: parsed.rationale || '',
      allFloorsPass,
      vibe: parsed.vibe || null  // { emoji, observation } if voice mode
    };
  } catch (error) {
    console.warn('[EVAL] Failed to parse response, using fallback:', error.message);
    // Return safe defaults with empty scores
    return {
      response: responseText,
      speechAct: 'directive',
      dialogueAct: 'probe_deeper',
      criteria: [],
      rubricScores: {
        'depth-of-questioning': null,
        'self-awareness': null,
        'systems-thinking': null,
        'experimentation-evidence': null,
        'authenticity': null,
        'reciprocal-curiosity': null,
        'family-integration': null
      },
      stance: {
        orientation: null,
        agency: null,
        certainty: null
      },
      fitScore: null,
      rationale: 'Fallback evaluation',
      allFloorsPass: false,
      vibe: null
    };
  }
}

// ========== DATABASE STORAGE FUNCTIONS ==========

async function storeConversation(req, sessionId, email, messages, aiMessage, evaluation, voiceSignals = null) {
  // In mock mode, use in-memory store
  if (isMockMode(req)) {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    const existing = testStore.get(sessionId) || [];
    existing.push({
      userMessage: lastUserMessage,
      response: aiMessage,
      speechAct: evaluation.speechAct,
      dialogueAct: evaluation.dialogueAct,
      fitScore: evaluation.fitScore,
      voiceSignals
    });
    testStore.set(sessionId, existing);
    console.log(`[MOCK DB] Stored turn ${existing.length} for session ${sessionId}`);
    return;
  }

  try {
    // Get the last user message (most recent user input)
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

    // Build operational data structure for this turn
    const turnData = {
      userMessage: lastUserMessage,
      response: aiMessage,
      speechAct: evaluation.speechAct,
      dialogueAct: evaluation.dialogueAct,
      criteria: evaluation.criteria,
      rubricScores: evaluation.rubricScores,
      stance: evaluation.stance,
      fitScore: evaluation.fitScore,
      allFloorsPass: evaluation.allFloorsPass,
      rationale: evaluation.rationale,
      vibe: evaluation.vibe,  // LLM-interpreted vibe (voice mode only)
      voiceSignals  // Raw voice signals from Whisper
    };

    // Store to Postgres
    const result = await storeTurn(sessionId, email, turnData);
    console.log(`[DB] Stored turn ${result.turnNumber} for session ${sessionId}, fitScore: ${evaluation.fitScore}`);
  } catch (error) {
    // Log but don't break chat - storage failure shouldn't stop conversation
    console.error('[DB] Storage failed:', error.message);
  }
}
