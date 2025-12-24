// Database module for Neon Postgres
// Single table: turns (a conversation is just a set of turns with the same session_id)
import { neon } from '@neondatabase/serverless';

function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable not set');
  }
  return neon(connectionString);
}

// Initialize schema
// force=true drops and recreates
export async function initSchema(force = false) {
  const sql = getDb();

  if (force) {
    await sql`DROP TABLE IF EXISTS turns CASCADE`;
    await sql`DROP TABLE IF EXISTS conversations CASCADE`;
    await sql`DROP TABLE IF EXISTS session_metadata CASCADE`;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS turns (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      turn_number INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),

      user_message TEXT,
      ai_response TEXT,
      evaluation JSONB,
      voice_signals JSONB,

      UNIQUE(session_id, turn_number)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_turns_email ON turns(email) WHERE email IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_turns_created ON turns(created_at DESC)`;

  return { success: true, message: force ? 'Schema recreated' : 'Schema initialized' };
}

// Store a turn
export async function storeTurn(sessionId, email, turnData) {
  const sql = getDb();

  // Get next turn number for this session
  const existing = await sql`
    SELECT COALESCE(MAX(turn_number), 0) as max_turn
    FROM turns WHERE session_id = ${sessionId}
  `;
  const turnNumber = (existing[0]?.max_turn || 0) + 1;

  // Build evaluation JSONB
  const evaluation = {
    speechAct: turnData.speechAct,
    dialogueAct: turnData.dialogueAct,
    criteria: turnData.criteria,
    rubricScores: turnData.rubricScores,
    fitScore: turnData.fitScore,
    allFloorsPass: turnData.allFloorsPass,
    rationale: turnData.rationale,
    vibe: turnData.vibe || null  // { emoji, observation } if voice mode
  };

  // Voice signals (optional)
  const voiceSignals = turnData.voiceSignals || null;

  await sql`
    INSERT INTO turns (session_id, email, turn_number, user_message, ai_response, evaluation, voice_signals)
    VALUES (
      ${sessionId},
      ${email || null},
      ${turnNumber},
      ${turnData.userMessage},
      ${turnData.response},
      ${JSON.stringify(evaluation)},
      ${voiceSignals ? JSON.stringify(voiceSignals) : null}
    )
  `;

  return { turnNumber };
}

// Get conversation by session ID
export async function getConversation(sessionId) {
  const sql = getDb();

  const turns = await sql`
    SELECT * FROM turns
    WHERE session_id = ${sessionId}
    ORDER BY turn_number ASC
  `;

  return {
    sessionId,
    turns,
    turnCount: turns.length
  };
}

// Get session by email (for cross-device resume)
// Returns the most recent session_id for this email
export async function getSessionByEmail(email) {
  const sql = getDb();

  const result = await sql`
    SELECT session_id, email, MAX(created_at) as last_activity
    FROM turns
    WHERE LOWER(email) = LOWER(${email})
    GROUP BY session_id, email
    ORDER BY last_activity DESC
    LIMIT 1
  `;

  if (result.length === 0) {
    return null;
  }

  return {
    sessionId: result[0].session_id,
    email: result[0].email,
    lastActivity: result[0].last_activity
  };
}

// Get recent sessions (for admin)
export async function getRecentSessions(limit = 20) {
  const sql = getDb();

  const sessions = await sql`
    SELECT
      session_id,
      email,
      COUNT(*) as turn_count,
      MAX(created_at) as last_activity,
      MIN(created_at) as started_at,
      MAX((evaluation->>'fitScore')::int) as max_fit_score
    FROM turns
    GROUP BY session_id, email
    ORDER BY last_activity DESC
    LIMIT ${limit}
  `;

  return sessions;
}

// Link email to a session (update all turns in that session)
export async function linkEmailToSession(sessionId, email) {
  const sql = getDb();

  await sql`
    UPDATE turns
    SET email = ${email}
    WHERE session_id = ${sessionId}
  `;

  return { success: true };
}

// Test connection
export async function testConnection() {
  try {
    const sql = getDb();
    const result = await sql`SELECT NOW() as now`;
    return { connected: true, serverTime: result[0].now };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}
