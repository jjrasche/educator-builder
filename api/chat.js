// Vercel serverless function - orchestrates judge + fit + streaming
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  try {
    // 1. Judge the conversation (async, can happen while response prepares)
    const judgePromise = callJudge(messages);

    // 2. Initialize Groq client
    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    // 3. Build base system prompt
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

    // 4. Wait for judge result and decide: probe or respond naturally
    let systemPrompt = basePrompt;
    const judgeResult = await judgePromise;

    // If judge has a probe question and conversation is early, use it
    let probeGuidance = '';
    if (judgeResult && judgeResult.action === 'probe' && judgeResult.probeQuestion) {
      probeGuidance = `\n\nNext question to ask: ${judgeResult.probeQuestion}`;
      systemPrompt += probeGuidance;
    }

    // 5. Stream Groq response
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

    // 6. Calculate fit and send metadata
    if (judgeResult && judgeResult.criteriaScores) {
      const fitResult = await callCalculateFit(judgeResult.criteriaScores);

      res.write(`data: ${JSON.stringify({
        type: 'metadata',
        fitScore: fitResult.fitScore,
        canUnlockEmail: fitResult.canUnlockEmail
      })}\n\n`);

      // 7. Log evaluation (fire and forget)
      logEvaluation(judgeResult, fitResult).catch(err =>
        console.error('Logging error:', err.message)
      );
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

async function callJudge(messages) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatHistory: messages })
    });

    if (!response.ok) {
      throw new Error(`Judge failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Judge call failed:', error.message);
    // Return neutral result on failure
    return {
      criteriaScores: {
        'depth-of-questioning': 5,
        'self-awareness': 5,
        'systems-thinking': 5,
        'experimentation-evidence': 5,
        'authenticity': 5,
        'reciprocal-curiosity': 5
      },
      coachingQuestion: null
    };
  }
}

async function callCalculateFit(criteriaScores) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/calculate-fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteriaScores })
    });

    if (!response.ok) {
      throw new Error(`Fit calculation failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Fit calculation failed:', error.message);
    // Return default on failure
    return {
      fitScore: 0,
      floorsPass: false,
      canUnlockEmail: false
    };
  }
}

async function logEvaluation(judgeResult, fitResult) {
  try {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Append to evaluations.jsonl
    const logFile = path.join(logsDir, 'evaluations.jsonl');
    const logEntry = {
      timestamp: new Date().toISOString(),
      criteriaScores: judgeResult.criteriaScores,
      fitScore: fitResult.fitScore,
      rationale: judgeResult.rationale
    };

    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    console.error('Logging error:', error.message);
    // Don't throw - logging failure shouldn't break the chat
  }
}
