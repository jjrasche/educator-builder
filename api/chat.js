// Vercel serverless function for Groq API
import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  try {
    // Groq uses OpenAI-compatible API
    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    // System message for the hiring chatbot
    const systemMessage = {
      role: 'system',
      content: `You are an AI assistant helping evaluate candidates for a live-in educator/builder role in West Michigan.

Your goal: Have a genuine conversation to understand if they're a fit. Focus on:
- How they think through problems
- Whether they're genuinely curious
- How they use AI in their workflow
- What draws them to this opportunity

Key details about the role:
- Live-in position: room in family home, part of daily life
- 10-60 hrs/month flexible work
- $300/month + room/board/meals (effective $2000-2500/month value)
- Work on: 3Cs coordination software, Everything Stack AI framework, food forest
- 2-week notice to leave anytime
- Everything documented in writing

Be conversational, not formal. Ask follow-up questions. Probe their thinking. Surface red flags (need for hand-holding, not AI-native, mercenary mindset).

Keep responses concise (2-3 sentences). After 3-4 good exchanges, you can suggest they move to the next step (project selection).`
    };

    const stream = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [systemMessage, ...messages],
      stream: true,
      temperature: 0.8,
    });

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream the response
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Groq API error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      status: error.status,
      response: error.response
    });
    res.status(500).json({
      error: 'Failed to get response from Groq',
      details: error.message,
      stack: error.stack?.split('\n')[0]
    });
  }
}
