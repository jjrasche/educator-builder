// Session recovery endpoint - retrieves conversation from Postgres
import { getConversation } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  try {
    const conversation = await getConversation(sessionId);

    if (!conversation.turns || conversation.turns.length === 0) {
      return res.status(200).json({
        found: false,
        chatHistory: [],
        exchanges: 0
      });
    }

    // Convert turns to chat history format
    const chatHistory = [];
    for (const turn of conversation.turns) {
      if (turn.user_message) {
        chatHistory.push({ role: 'user', content: turn.user_message });
      }
      if (turn.ai_response) {
        chatHistory.push({ role: 'assistant', content: turn.ai_response });
      }
    }

    // Get latest evaluation from last turn
    const lastTurn = conversation.turns[conversation.turns.length - 1];
    const evaluation = lastTurn.evaluation || {};

    res.status(200).json({
      found: true,
      chatHistory,
      exchanges: conversation.turnCount,
      lastMetadata: {
        fitScore: evaluation.fitScore || null,
        allFloorsPass: evaluation.allFloorsPass || false,
        canUnlockEmail: (evaluation.fitScore >= 60 && evaluation.allFloorsPass) || false
      }
    });

  } catch (error) {
    console.error('Session retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve session',
      details: error.message
    });
  }
}
