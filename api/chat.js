// Vercel serverless function - handles chat streaming + continuous inline evaluation + KV storage
// ARCHITECTURE: Single LLM call returns response + speechAct + dialogueAct + criteria + rubricScores + fitScore every turn
import OpenAI from 'openai';
import { kv } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

// MOCK_MODE: For E2E testing without external API calls
// When MOCK_MODE=true, mocks Groq API and Vercel KV only. All internal logic runs for real.
// Can be enabled via env var OR X-Mock-Mode header for testing.
function isMockMode(req) {
  return process.env.MOCK_MODE === 'true' || req?.headers?.['x-mock-mode'] === 'true';
}

// In-memory KV for testing (shared across requests in same process)
const testKVStore = globalThis.__testKVStore || (globalThis.__testKVStore = new Map());

// Mock KV wrapper - needs request context
function createKVWrapper(req) {
  const mockMode = isMockMode(req);
  return {
    get: async (key) => {
      if (mockMode) return testKVStore.get(key) || null;
      return kv.get(key);
    },
    set: async (key, value) => {
      if (mockMode) { testKVStore.set(key, value); return; }
      return kv.set(key, value);
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, sessionId, email } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  try {
    // 1. Load rubric for evaluation context
    const rubricPath = path.join(process.cwd(), 'data', 'rubric-v1.json');

    if (!fs.existsSync(rubricPath)) {
      throw new Error(`Rubric file not found: ${rubricPath}`);
    }

    let rubric;
    try {
      const rubricData = fs.readFileSync(rubricPath, 'utf-8');
      rubric = JSON.parse(rubricData);
    } catch (parseError) {
      throw new Error(`Failed to parse rubric file: ${parseError.message}`);
    }

    // 2. Build system prompt with evaluation instruction
    const systemPrompt = buildSystemPrompt(rubric);

    // 3. Get response from Groq (or mock in test mode)
    let responseText;

    if (isMockMode(req)) {
      // MOCK: Generate deterministic response based on conversation state
      responseText = getMockGroqResponse(messages);
      console.log('[MOCK] Using mock Groq response');
    } else {
      // REAL: Call Groq API
      const client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const groqResponse = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 1500
      });

      responseText = groqResponse.choices[0]?.message?.content;
    }

    if (!responseText) {
      throw new Error('Empty response from Groq');
    }

    // 5. Parse JSON response to extract structured data
    const evaluation = parseEvaluationResponse(responseText, rubric);

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
    res.write(`data: ${JSON.stringify({
      type: 'metadata',
      speechAct: evaluation.speechAct,
      dialogueAct: evaluation.dialogueAct,
      criteria: evaluation.criteria,
      rubricScores: evaluation.rubricScores,
      fitScore: evaluation.fitScore,
      rationale: evaluation.rationale,
      allFloorsPass: evaluation.allFloorsPass,
      canUnlockEmail: evaluation.fitScore !== null && evaluation.fitScore >= 60 && evaluation.allFloorsPass
    })}\n\n`);

    // 9. Store conversation to KV (fire and forget)
    storeConversation(req, sessionId, email, messages, response, evaluation).catch(err =>
      console.error('KV storage error:', err.message)
    );

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
  if (isShallow) {
    return JSON.stringify({
      response: "Housing is about $900/mo value, meals another $400/mo, plus $300 cash if you want it—works out to roughly $22-32/hour depending on hours. What about that matters most to you? Is it the housing security, the flexibility, or something else entirely?",
      speechAct: "assertive",
      dialogueAct: "probe_deeper",
      criteria: ["depth of questioning"],
      rubricScores: { "depth-of-questioning": 3, "self-awareness": 4, "systems-thinking": 4, "experimentation-evidence": 4, "authenticity": 5, "reciprocal-curiosity": 3 },
      fitScore: 35,
      rationale: "Answered logistics, now probing for underlying motivation"
    });
  }

  // Priority 2: Deep + commitment signals get high scores
  if (isDeep && hasCommitment) {
    return JSON.stringify({
      response: "I hear real clarity in what you're saying. You're not just looking for a job—you're looking for a context where you can do meaningful work alongside people who care. What questions do you have about how we actually work together?",
      speechAct: "expressive",
      dialogueAct: "affirm_commitment",
      criteria: ["commitment signals", "value alignment", "authenticity"],
      rubricScores: { "depth-of-questioning": 8, "self-awareness": 8, "systems-thinking": 7, "experimentation-evidence": 7, "authenticity": 9, "reciprocal-curiosity": 7 },
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
      rubricScores: { "depth-of-questioning": 6, "self-awareness": 6, "systems-thinking": 6, "experimentation-evidence": 5, "authenticity": 6, "reciprocal-curiosity": 5 },
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
    rubricScores: { "depth-of-questioning": 5, "self-awareness": 5, "systems-thinking": 5, "experimentation-evidence": 5, "authenticity": 5, "reciprocal-curiosity": 5 },
    fitScore: 50,
    rationale: "Opening question to gauge genuine interest"
  });
}

// ========== SYSTEM PROMPT & EVALUATION FUNCTIONS ==========

function buildSystemPrompt(rubric) {
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

**CRITICAL - Handling logistics questions (pay, hours, benefits, location):**
Always use the ANSWER → BRIDGE → PROBE pattern:
1. ANSWER the question fully and honestly
2. BRIDGE to what it reveals about their thinking
3. PROBE to discover if there's depth underneath

Examples:
- "How much does it pay?" → "Housing (~$900/mo value) + meals (~$400/mo) + $300 cash if you want it. Works out to roughly $22-32/hour depending on hours. What about that matters most to you—the housing security, the flexibility, or something else?"
- "What are the hours?" → "10-60 hours/month, totally flexible based on what we're building together. What kind of rhythm are you looking for? Are you trying to create space for something else, or looking for full immersion?"
- "Is it remote?" → "It's live-in—you'd have a private suite here. What draws you to remote vs. in-person work? That tells me something about what you're optimizing for."

The probe reveals whether they're thinking systemically or just job shopping. A pure logistics question with no curiosity = low fit. Logistics question + genuine exploration of why = potential depth.

**Probe for specificity:** When someone uses abstract language ("transformative energy," "collective consciousness," "paradigm shift," "mutual aid frameworks"), ask: "What does that actually look like? Can you give me a concrete example?" Vague language often signals performance. Authentic people can ground their ideas in experience.

**Your vibe:** Not evaluating. Searching. "Finally, someone else is thinking about this." Ask follow-ups that go deeper. If they say something real, probe: "Why does that matter to you?" If they sound rehearsed, ask: "Tell me about a time when..."

**The invitation:** "We don't have all the answers. We're building this culture together. Live here. Work with us. Help us figure out what's possible when we prioritize freedom and interdependence over extraction and isolation."

**About the role:**
- Live-in position: private suite in family home
- 10-60 hrs/month flexible work
- Housing + meals (~$1,300/month value) + optional $300/month cash
- Work:
  - 3Cs: Coordination (organizing people/systems), Cultivation (growing food/culture), Creation (building tools/software)
  - Everything Stack: Modern AI tools integrated as a unified learning system
  - Food forest: Permaculture food system combining autonomy + abundance
- 2-week notice to leave anytime
- Everything documented in writing
- Next step: Paid working interview ($50/hr, 2-4 hours)

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
    "reciprocal-curiosity": 1-10
  },
  "fitScore": 0-100,
  "rationale": "Brief 1-2 sentence explanation"
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
      'reciprocal-curiosity': null
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

    // Validate required fields and provide defaults
    return {
      response: parsed.response || responseText,
      speechAct: parsed.speechAct || 'directive',
      dialogueAct: parsed.dialogueAct || 'probe_deeper',
      criteria: Array.isArray(parsed.criteria) ? parsed.criteria : [],
      rubricScores,
      fitScore: typeof parsed.fitScore === 'number' ? parsed.fitScore : null,
      rationale: parsed.rationale || '',
      allFloorsPass
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
        'reciprocal-curiosity': null
      },
      fitScore: null,
      rationale: 'Fallback evaluation',
      allFloorsPass: false
    };
  }
}

// ========== KV STORAGE FUNCTIONS ==========

async function storeConversation(req, sessionId, email, messages, aiMessage, evaluation) {
  const kvWrapper = createKVWrapper(req);

  try {
    // Get the last user message (most recent user input)
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

    // Build operational data structure for this turn
    // Continuous scoring: every turn gets this data
    const turnData = {
      userMessage: lastUserMessage,
      response: aiMessage,
      speechAct: evaluation.speechAct,
      dialogueAct: evaluation.dialogueAct,
      criteria: evaluation.criteria,
      rubricScores: evaluation.rubricScores,
      fitScore: evaluation.fitScore,
      allFloorsPass: evaluation.allFloorsPass,
      rationale: evaluation.rationale,
      timestamp: new Date().toISOString()
    };

    // Store by sessionId
    // KV structure: conversation:{sessionId} = array of turns
    const kvKey = `conversation:${sessionId}`;
    const existing = await kvWrapper.get(kvKey) || [];
    const updated = Array.isArray(existing) ? existing : [existing].filter(x => x);
    updated.push(turnData);
    await kvWrapper.set(kvKey, updated);

    // If email provided, create link: email:{email} -> sessionId
    // This allows querying by email later
    if (email) {
      await kvWrapper.set(`email:${email}`, sessionId);
    }

    // Also store metadata for this session
    const metadataKey = `metadata:${sessionId}`;
    const existingMetadata = await kvWrapper.get(metadataKey) || {};
    const metadata = {
      email: email || null,
      turnCount: updated.length,
      lastFitScore: evaluation.fitScore,
      lastAllFloorsPass: evaluation.allFloorsPass,
      lastEvaluated: new Date().toISOString(),
      startedAt: existingMetadata.startedAt || new Date().toISOString()
    };
    await kvWrapper.set(metadataKey, metadata);

    console.log(`[KV] Stored turn ${updated.length} for session ${sessionId}, fitScore: ${evaluation.fitScore}`);
  } catch (error) {
    // Silently fail - chat should never break because of logging
    console.warn('[KV] Storage failed:', error.message);
  }
}
