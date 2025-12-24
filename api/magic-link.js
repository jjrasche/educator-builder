// Links email to session for cross-device resume
// Updates all turns in the session with the user's email
import { linkEmailToSession } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, sessionId } = req.body;

  if (!email || !sessionId) {
    return res.status(400).json({ error: 'email and sessionId required' });
  }

  try {
    // Update all turns in this session with the email
    await linkEmailToSession(sessionId, email.toLowerCase());

    console.log(`[EMAIL-LINK] Linked ${email} to session ${sessionId}`);

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Email link error:', error);
    res.status(500).json({
      error: 'Failed to link email',
      details: error.message
    });
  }
}
