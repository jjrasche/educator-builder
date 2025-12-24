// Cross-device resume - looks up session by email
import { getSessionByEmail, getConversation } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }

  try {
    // Find session by email
    const session = await getSessionByEmail(email);

    if (!session) {
      return res.status(200).json({
        found: false,
        message: 'No session found for this email'
      });
    }

    // Get full conversation
    const conversation = await getConversation(session.sessionId);

    if (!conversation.turns || conversation.turns.length === 0) {
      return res.status(200).json({
        found: true,
        sessionId: session.sessionId,
        email: session.email,
        hasConversation: false,
        message: 'Session found but no conversation data'
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

    // Get latest evaluation
    const lastTurn = conversation.turns[conversation.turns.length - 1];
    const evaluation = lastTurn.evaluation || {};

    console.log(`[RESUME] Email lookup: ${email}, session ${session.sessionId}, ${conversation.turnCount} turns`);

    res.status(200).json({
      found: true,
      sessionId: session.sessionId,
      email: session.email,
      hasConversation: true,
      chatHistory,
      exchanges: conversation.turnCount,
      lastMetadata: {
        fitScore: evaluation.fitScore || null,
        allFloorsPass: evaluation.allFloorsPass || false,
        canUnlockEmail: (evaluation.fitScore >= 60 && evaluation.allFloorsPass) || false
      }
    });

  } catch (error) {
    console.error('Resume email lookup error:', error);
    res.status(500).json({
      error: 'Failed to look up session',
      details: error.message
    });
  }
}
