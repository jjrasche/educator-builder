// Admin endpoint to verify KV is working and retrieve conversation data
// GET /api/admin/kv-check?sessionId=xxx - retrieve specific session
// GET /api/admin/kv-check?test=true - write and read back test data
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, test } = req.query;

  try {
    // Test mode: write and read back
    if (test === 'true') {
      const testKey = `test:${Date.now()}`;
      const testValue = { written: new Date().toISOString(), msg: 'KV is working' };

      await kv.set(testKey, testValue);
      const readBack = await kv.get(testKey);
      await kv.del(testKey); // cleanup

      if (!readBack) {
        return res.status(500).json({
          status: 'FAIL',
          error: 'Write succeeded but read returned null',
          kvConfigured: false
        });
      }

      return res.status(200).json({
        status: 'PASS',
        message: 'KV write/read verified',
        written: testValue,
        readBack: readBack,
        kvConfigured: true
      });
    }

    // Retrieve specific session
    if (sessionId) {
      const conversation = await kv.get(`conversation:${sessionId}`);
      const metadata = await kv.get(`metadata:${sessionId}`);

      if (!conversation && !metadata) {
        return res.status(404).json({
          status: 'NOT_FOUND',
          sessionId,
          message: 'No data found for this session',
          kvConfigured: true // KV works, just no data
        });
      }

      return res.status(200).json({
        status: 'FOUND',
        sessionId,
        turnCount: Array.isArray(conversation) ? conversation.length : 0,
        conversation,
        metadata,
        kvConfigured: true
      });
    }

    // No params: just check if KV is configured
    const testKey = `ping:${Date.now()}`;
    await kv.set(testKey, 'pong');
    const pong = await kv.get(testKey);
    await kv.del(testKey);

    return res.status(200).json({
      status: pong === 'pong' ? 'CONFIGURED' : 'MISCONFIGURED',
      message: 'KV connection verified',
      kvConfigured: pong === 'pong'
    });

  } catch (error) {
    // Check for specific KV configuration errors
    const isConfigError = error.message?.includes('KV_REST_API') ||
                          error.message?.includes('ENOTFOUND') ||
                          error.message?.includes('unauthorized');

    return res.status(500).json({
      status: 'ERROR',
      error: error.message,
      kvConfigured: false,
      hint: isConfigError
        ? 'KV not configured. Create a KV store in Vercel dashboard and connect to this project.'
        : 'Unknown error'
    });
  }
}
