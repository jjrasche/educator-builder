// Vercel serverless function - orchestrates unified /api/evaluate + streaming
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
    // 1. Evaluate conversation (async - probes or assesses based on turn count)
    const evaluationPromise = callEvaluate(messages);

    // 2. Initialize Groq client for streaming response
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

    // 4. Wait for evaluation and integrate guidance
    let systemPrompt = basePrompt;
    const evaluationResult = await evaluationPromise;

    // If evaluator suggests a probe, add it to system prompt
    if (evaluationResult && evaluationResult.action === 'probe' && evaluationResult.probeQuestion) {
      systemPrompt += `\n\nGuidance: Consider asking about: ${evaluationResult.probeQuestion}`;
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

    // 6. If assessment complete, send fitness score metadata
    if (evaluationResult && evaluationResult.action === 'assess' && evaluationResult.fitScore) {
      res.write(`data: ${JSON.stringify({
        type: 'metadata',
        fitScore: evaluationResult.fitScore,
        decision: evaluationResult.decision,
        canUnlockEmail: evaluationResult.decision === 'request_email'
      })}\n\n`);

      // Log evaluation (fire and forget)
      logEvaluation(evaluationResult).catch(err =>
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

async function callEvaluate(messages) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatHistory: messages })
    });

    if (!response.ok) {
      throw new Error(`Evaluation failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Evaluation call failed:', error.message);
    // Return neutral probe on failure
    return {
      action: 'probe',
      probeQuestion: 'Can you tell me more about what draws you to this?'
    };
  }
}

async function logEvaluation(evaluationResult) {
  try {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Append to evaluations.jsonl
    const logFile = path.join(logsDir, 'evaluations.jsonl');
    const logEntry = {
      timestamp: evaluationResult.timestamp || new Date().toISOString(),
      criteriaScores: evaluationResult.criteriaScores,
      fitScore: evaluationResult.fitScore,
      decision: evaluationResult.decision,
      rationale: evaluationResult.rationale
    };

    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    console.error('Logging error:', error.message);
    // Don't throw - logging failure shouldn't break the chat
  }
}
