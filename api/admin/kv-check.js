// Admin endpoint to verify database is working and retrieve conversation data
// GET /api/admin/kv-check?test=true - write and read back test data
// GET /api/admin/kv-check?sessionId=xxx - retrieve specific session
// GET /api/admin/kv-check?init=true - initialize database schema
// GET /api/admin/kv-check?recent=true - list recent sessions
import { testConnection, initSchema, getConversation, getRecentSessions, storeTurn } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, test, init, recent, force } = req.query;

  try {
    // Initialize schema (force=true drops and recreates)
    if (init === 'true') {
      const result = await initSchema(force === 'true');
      return res.status(200).json({
        status: 'INITIALIZED',
        ...result
      });
    }

    // Test mode: write and read back
    if (test === 'true') {
      // First check connection
      const connTest = await testConnection();
      if (!connTest.connected) {
        return res.status(500).json({
          status: 'FAIL',
          error: connTest.error,
          dbConfigured: false
        });
      }

      // Try to init schema if needed
      try {
        await initSchema();
      } catch (schemaError) {
        // Schema might already exist, that's fine
        console.log('Schema init:', schemaError.message);
      }

      // Write a test turn
      const testSessionId = `test-${Date.now()}`;
      const testTurn = {
        userMessage: 'Test message',
        response: 'Test response',
        speechAct: 'assertive',
        dialogueAct: 'probe_deeper',
        criteria: ['test'],
        rubricScores: { 'depth-of-questioning': 5 },
        fitScore: 50,
        allFloorsPass: true,
        rationale: 'Test rationale',
        voiceSignals: { wpm: 120, paceCategory: 'measured', clarity: 'clear' }
      };

      await storeTurn(testSessionId, null, testTurn);

      // Read it back
      const readBack = await getConversation(testSessionId);

      if (!readBack.turns || readBack.turns.length === 0) {
        return res.status(500).json({
          status: 'FAIL',
          error: 'Write succeeded but read returned no data',
          dbConfigured: true
        });
      }

      return res.status(200).json({
        status: 'PASS',
        message: 'Database write/read verified',
        written: testTurn,
        readBack: readBack.turns[0],
        dbConfigured: true,
        serverTime: connTest.serverTime
      });
    }

    // List recent sessions
    if (recent === 'true') {
      const sessions = await getRecentSessions(20);
      return res.status(200).json({
        status: 'OK',
        sessionCount: sessions.length,
        sessions,
        dbConfigured: true
      });
    }

    // Retrieve specific session
    if (sessionId) {
      const conversation = await getConversation(sessionId);

      if (!conversation.turns || conversation.turns.length === 0) {
        return res.status(404).json({
          status: 'NOT_FOUND',
          sessionId,
          message: 'No data found for this session',
          dbConfigured: true
        });
      }

      return res.status(200).json({
        status: 'FOUND',
        sessionId,
        turnCount: conversation.turnCount,
        turns: conversation.turns,
        dbConfigured: true
      });
    }

    // No params: just check connection
    const connTest = await testConnection();

    return res.status(200).json({
      status: connTest.connected ? 'CONFIGURED' : 'MISCONFIGURED',
      message: connTest.connected ? 'Database connection verified' : 'Database connection failed',
      dbConfigured: connTest.connected,
      serverTime: connTest.serverTime,
      error: connTest.error
    });

  } catch (error) {
    // Check for specific configuration errors
    const isConfigError = error.message?.includes('DATABASE_URL') ||
                          error.message?.includes('ENOTFOUND') ||
                          error.message?.includes('connection');

    return res.status(500).json({
      status: 'ERROR',
      error: error.message,
      dbConfigured: false,
      hint: isConfigError
        ? 'Database not configured. Add DATABASE_URL to Vercel environment variables.'
        : 'Unknown error'
    });
  }
}
