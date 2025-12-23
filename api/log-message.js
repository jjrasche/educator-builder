// Vercel KV logging for conversation messages
// Stores real-time messages for pattern analysis

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, message, role, timestamp, stage, projectsInterested } = req.body;

  if (!email || !message || !role) {
    return res.status(400).json({ error: 'Missing required fields: email, message, role' });
  }

  try {
    // For MVP, store in-memory or simple file-based storage
    // Later: integrate with Vercel KV

    const conversationKey = `conversation:${email}`;
    const messageEntry = {
      role,
      content: message,
      timestamp: timestamp || new Date().toISOString(),
      stage,
      projectsInterested
    };

    // Log to console for now (Vercel will capture in function logs)
    console.log(`[${conversationKey}]`, messageEntry);

    // Return success
    res.status(200).json({
      success: true,
      logged: {
        email,
        messageCount: 1,
        timestamp: messageEntry.timestamp
      }
    });

  } catch (error) {
    console.error('Logging error:', error);
    res.status(500).json({
      error: 'Failed to log message',
      details: error.message
    });
  }
}
