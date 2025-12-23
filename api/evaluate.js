// Unified evaluation endpoint: probes, scores, calculates fitness
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chatHistory } = req.body;

  if (!chatHistory || !Array.isArray(chatHistory)) {
    return res.status(400).json({ error: 'Invalid chatHistory format' });
  }

  try {
    // Load rubric
    const rubricPath = path.join(process.cwd(), 'data', 'rubric-v1.json');
    const rubricData = fs.readFileSync(rubricPath, 'utf-8');
    const rubric = JSON.parse(rubricData);

    // Evaluate with retry
    const result = await evaluateWithRetry(chatHistory, rubric);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Evaluation error:', error);
    return res.status(500).json({
      error: 'Evaluation failed',
      details: error.message
    });
  }
}

async function evaluateWithRetry(chatHistory, rubric, maxRetries = 1) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await evaluateConversation(client, chatHistory, rubric);
    } catch (error) {
      console.error(`Evaluation attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries + 1) {
        // Return neutral fallback
        console.warn('Evaluation fallback: returning neutral response');
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

      if (attempt < maxRetries + 1) {
        await sleep(1000 * attempt);
      }
    }
  }
}

async function evaluateConversation(client, chatHistory, rubric) {
  const userTurns = chatHistory.filter(msg => msg.role === 'user').length;
  const transcript = chatHistory
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  // Decision logic: probe early, assess when you have enough information
  const shouldAssess = userTurns >= 5;

  const prompt = shouldAssess
    ? buildAssessmentPrompt(transcript, rubric)
    : buildProbePrompt(transcript, rubric);

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
