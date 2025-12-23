// Evaluate conversation against rubric using Groq 70B
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

    // Call judge with retry
    const result = await callJudgeWithRetry(chatHistory, rubric);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Judge error:', error);
    return res.status(500).json({
      error: 'Judge failed',
      details: error.message
    });
  }
}

async function callJudgeWithRetry(chatHistory, rubric, maxRetries = 1) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await callGroqJudge(client, chatHistory, rubric);
    } catch (error) {
      console.error(`Judge attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries + 1) {
        // Final attempt failed, return neutral fallback
        console.warn('Judge fallback: returning neutral scores');
        return {
          rubricVersion: 'v1',
          criteriaScores: {
            'depth-of-questioning': 5,
            'self-awareness': 5,
            'systems-thinking': 5,
            'experimentation-evidence': 5,
            'authenticity': 5,
            'reciprocal-curiosity': 5
          },
          rationale: 'Evaluation temporarily unavailable',
          coachingQuestion: null,
          timestamp: new Date().toISOString()
        };
      }

      // Wait before retry
      if (attempt < maxRetries + 1) {
        await sleep(1000 * attempt); // 1s, then 2s if there were more retries
      }
    }
  }
}

async function callGroqJudge(client, chatHistory, rubric) {
  // Build transcript
  const transcript = chatHistory
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  // Count user turns - guide when to move to assessment
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
If turn 3+, decide based on what you know.`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.3,
    max_tokens: 600
  });

  const responseText = response.choices[0]?.message?.content;

  if (!responseText) {
    throw new Error('Empty response from Groq');
  }

  // Parse JSON response
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

  // Validate structure
  if (!parsed.action) {
    throw new Error('Judge response missing action field');
  }

  return {
    rubricVersion: 'v1',
    action: parsed.action,
    probeQuestion: parsed.probeQuestion || null,
    assessment: parsed.assessment || null,
    timestamp: new Date().toISOString()
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
