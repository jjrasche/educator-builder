// Vercel serverless function - retrieves session data from KV for session recovery
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  try {
    // Get conversation turns from KV
    const kvKey = `conversation:${sessionId}`;
    const turns = await kv.get(kvKey);

    if (!turns || !Array.isArray(turns) || turns.length === 0) {
      return res.status(200).json({
        found: false,
        turns: [],
        metadata: null
      });
    }

    // Get metadata
    const metadataKey = `metadata:${sessionId}`;
    const metadata = await kv.get(metadataKey);

    // Convert turns to chat history format
    const chatHistory = [];
    for (const turn of turns) {
      if (turn.userMessage) {
        chatHistory.push({ role: 'user', content: turn.userMessage });
      }
      if (turn.response) {
        chatHistory.push({ role: 'assistant', content: turn.response });
      }
    }

    // Get latest evaluation data
    const lastTurn = turns[turns.length - 1];

    res.status(200).json({
      found: true,
      chatHistory,
      exchanges: turns.length,
      lastMetadata: {
        fitScore: lastTurn.fitScore,
        allFloorsPass: lastTurn.allFloorsPass,
        canUnlockEmail: lastTurn.fitScore >= 60 && lastTurn.allFloorsPass
      },
      metadata
    });

  } catch (error) {
    console.error('Session retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve session',
      details: error.message
    });
  }
}
