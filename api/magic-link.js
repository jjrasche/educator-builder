// Vercel serverless function - links email to session for cross-device resume
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, sessionId, name } = req.body;

  if (!email || !sessionId) {
    return res.status(400).json({ error: 'email and sessionId required' });
  }

  try {
    // Store email -> sessionId mapping (no expiry - sessions persist indefinitely)
    const emailKey = `email:${email.toLowerCase()}`;
    await kv.set(emailKey, sessionId);

    // Update session metadata with email
    const metadataKey = `metadata:${sessionId}`;
    const metadata = await kv.get(metadataKey) || {};
    await kv.set(metadataKey, {
      ...metadata,
      email: email.toLowerCase(),
      name: name || metadata.name
    });

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
