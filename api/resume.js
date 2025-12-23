// Vercel serverless function - looks up session by email for cross-device resume
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }

  try {
    // Look up email -> sessionId
    const emailKey = `email:${email.toLowerCase()}`;
    const sessionId = await kv.get(emailKey);

    if (!sessionId) {
      return res.status(200).json({
        found: false,
        message: 'No session found for this email'
      });
    }

    // Get conversation data
    const conversationKey = `conversation:${sessionId}`;
    const turns = await kv.get(conversationKey);

    // Get metadata
    const metadataKey = `metadata:${sessionId}`;
    const metadata = await kv.get(metadataKey) || {};

    if (!turns || !Array.isArray(turns) || turns.length === 0) {
      return res.status(200).json({
        found: true,
        sessionId,
        email: email.toLowerCase(),
        name: metadata.name || null,
        hasConversation: false,
        message: 'Session found but no conversation data'
      });
    }

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

    // Get latest evaluation
    const lastTurn = turns[turns.length - 1];

    console.log(`[RESUME] Email lookup: ${email}, session ${sessionId}, ${turns.length} turns`);

    res.status(200).json({
      found: true,
      sessionId,
      email: email.toLowerCase(),
      name: metadata.name || null,
      hasConversation: true,
      chatHistory,
      exchanges: turns.length,
      lastMetadata: {
        fitScore: lastTurn.fitScore,
        allFloorsPass: lastTurn.allFloorsPass,
        canUnlockEmail: lastTurn.fitScore >= 60 && lastTurn.allFloorsPass
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
