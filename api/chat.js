// Vercel serverless function - handles chat streaming + inline evaluation + KV storage
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, sessionId, email } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  try {
    // 1. Load rubric for evaluation
    const rubricPath = path.join(process.cwd(), 'data', 'rubric-v1.json');
    const rubricData = fs.readFileSync(rubricPath, 'utf-8');
    const rubric = JSON.parse(rubricData);

    // 2. Evaluate conversation inline
    const evaluationResult = await evaluateConversation(messages, rubric);

    // 3. Initialize Groq client for streaming response
    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    // 4. Build base system prompt
    const basePrompt = `You are Claude, helping Jim find people who want to co-create a different way of living and working together.

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

**Your vibe:** Not evaluating. Searching. "Finally, someone else is thinking about this." Ask follow-ups that go deeper. If they say something real, probe: "Why does that matter to you?"

**The invitation:** "We don't have all the answers. We're building this culture together. Live here. Work with us. Help us figure out what's possible when we prioritize freedom and interdependence over extraction and isolation."

**About the role:**
- Live-in position: private suite in family home
- 10-60 hrs/month flexible work
- Housing + meals (~$1,300/month value) + optional $300/month cash
- Work: 3Cs coordination software, Everything Stack AI framework, food forest
- 2-week notice to leave anytime
- Everything documented in writing
- Next step: Paid working interview ($50/hr, 2-4 hours)

Be conversational. Keep responses 2-3 sentences unless deep exploration is happening.`;

    // 5. Integrate evaluation guidance into system prompt
    let systemPrompt = basePrompt;
    if (evaluationResult && evaluationResult.action === 'probe' && evaluationResult.probeQuestion) {
      systemPrompt += `\n\nGuidance: Consider asking about: ${evaluationResult.probeQuestion}`;
    }

    // 6. Stream Groq response
    const stream = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
      temperature: 0.8,
    });

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream the response
    let aiMessage = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        aiMessage += content;
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    // 7. If assessment complete, send fitness score metadata
    if (evaluationResult && evaluationResult.action === 'assess' && evaluationResult.fitScore) {
      res.write(`data: ${JSON.stringify({
        type: 'metadata',
        fitScore: evaluationResult.fitScore,
        decision: evaluationResult.decision,
        canUnlockEmail: evaluationResult.decision === 'request_email'
      })}\n\n`);
    }

    // 8. Store conversation to KV (fire and forget)
    storeConversation(sessionId, email, messages, aiMessage, evaluationResult).catch(err =>
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

// ========== EVALUATION FUNCTIONS ==========

async function evaluateConversation(chatHistory, rubric) {
  const userTurns = chatHistory.filter(msg => msg.role === 'user').length;
  const transcript = chatHistory
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  // Decision logic: probe early, assess when you have enough information
  // TEMPORARY: lower threshold to 3 for testing
  const shouldAssess = userTurns >= 3;

  const prompt = shouldAssess
    ? buildAssessmentPrompt(transcript, rubric)
    : buildProbePrompt(transcript, rubric);

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  try {
    const messages = shouldAssess
      ? [
          { role: 'system', content: 'You are an assessment system. You MUST respond with ONLY valid JSON. No other text.' },
          { role: 'user', content: prompt }
        ]
      : [{ role: 'user', content: prompt }];

    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      temperature: shouldAssess ? 0.1 : 0.3,
      max_tokens: shouldAssess ? 500 : 700
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
      console.error('Parse error - raw response:', responseText.slice(0, 200));
      console.error('shouldAssess:', shouldAssess);
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

    // Debug: if assess was attempted but no criteriaScores
    if (shouldAssess && !parsed.criteriaScores) {
      console.warn('Assessment prompt sent but Groq returned:', Object.keys(parsed));
    }

    // Otherwise, return probe
    return {
      action: 'probe',
      probeQuestion: parsed.probeQuestion || 'Tell me more about your thinking on this.',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.warn('Evaluation failed:', error.message);
    // Return neutral probe on failure
    return {
      action: 'probe',
      probeQuestion: 'Can you tell me more about what draws you to this vision?',
      criteriaScores: {
        'depth-of-questioning': 5,
        'self-awareness': 5,
        'systems-thinking': 5,
        'experimentation-evidence': 5,
        'authenticity': 5,
        'reciprocal-curiosity': 5
      },
      fitScore: 50,
      decision: null,
      timestamp: new Date().toISOString()
    };
  }
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
  return `ASSESSMENT MODE - RETURN ONLY JSON

You are making a final assessment. Based on this conversation, score the person on each criterion (1-10 scale).

CONVERSATION:
${transcript}

SCORING CRITERIA:
- depth-of-questioning: How deeply do they explore ideas?
- self-awareness: Can they articulate what matters to them?
- systems-thinking: Do they see personal-community connections?
- experimentation-evidence: Are they builders/questioners or passive?
- authenticity: Genuine or performing?
- reciprocal-curiosity: Do they ask about others?

YOUR RESPONSE MUST BE VALID JSON WITH NO OTHER TEXT.
DO NOT include any explanation before or after the JSON.
DO NOT use markdown code blocks.
Output ONLY the raw JSON object:

{
  "criteriaScores": {
    "depth-of-questioning": 8,
    "self-awareness": 7,
    "systems-thinking": 6,
    "experimentation-evidence": 7,
    "authenticity": 8,
    "reciprocal-curiosity": 6
  },
  "rationale": "Summary of assessment"
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

// ========== KV STORAGE FUNCTIONS ==========

async function storeConversation(sessionId, email, messages, aiMessage, evaluationResult) {
  try {
    // Import Vercel KV dynamically (only available in Vercel environment)
    const { kv } = await import('@vercel/kv');

    // Build conversation record with this exchange
    const conversationRecord = {
      messages: messages,
      aiMessage: aiMessage,
      evaluation: evaluationResult ? {
        action: evaluationResult.action,
        ...(evaluationResult.action === 'assess' && {
          criteriaScores: evaluationResult.criteriaScores,
          fitScore: evaluationResult.fitScore,
          decision: evaluationResult.decision,
          rationale: evaluationResult.rationale
        }),
        ...(evaluationResult.action === 'probe' && {
          probeQuestion: evaluationResult.probeQuestion
        })
      } : null,
      timestamp: new Date().toISOString()
    };

    // Store by sessionId (primary key)
    // KV structure: conversation:{sessionId} = array of exchanges
    const kvKey = `conversation:${sessionId}`;
    const existing = await kv.get(kvKey) || [];
    const updated = Array.isArray(existing) ? existing : [existing];
    updated.push(conversationRecord);
    await kv.set(kvKey, updated);

    // If email provided, create link: email:{email} -> sessionId
    // This allows querying by email later
    if (email) {
      await kv.set(`email:${email}`, sessionId);
    }

    console.log(`KV stored: ${kvKey} (${updated.length} exchanges)`);
  } catch (error) {
    // Silently fail - chat should never break because of logging
    console.warn('KV storage failed:', error.message);
  }
}
