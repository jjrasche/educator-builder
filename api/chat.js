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
  const shouldAssess = userTurns >= 5;

  const prompt = shouldAssess
    ? buildAssessmentPrompt(transcript, rubric)
    : buildProbePrompt(transcript, rubric);

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  try {
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

// ========== KV STORAGE FUNCTIONS ==========

async function storeConversation(sessionId, email, messages, aiMessage, evaluationResult) {
  // TODO: Implement Vercel KV storage
  // For now, log to console
  console.log('Store conversation:', {
    sessionId,
    email,
    messageCount: messages.length,
    evaluation: evaluationResult?.action
  });
}
