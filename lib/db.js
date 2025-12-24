// Database module for Neon Postgres
// Handles connection and conversation storage/retrieval
import { neon } from '@neondatabase/serverless';

// Get database connection
function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable not set');
  }
  return neon(connectionString);
}

// Initialize schema (run once on first deploy)
export async function initSchema() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      turn_number INTEGER NOT NULL,
      user_message TEXT,
      ai_response TEXT,
      speech_act VARCHAR(50),
      dialogue_act VARCHAR(50),
      criteria JSONB,
      rubric_scores JSONB,
      fit_score INTEGER,
      all_floors_pass BOOLEAN,
      rationale TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_conversations_session_id
    ON conversations(session_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_conversations_email
    ON conversations(email) WHERE email IS NOT NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS session_metadata (
      session_id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255),
      turn_count INTEGER DEFAULT 0,
      last_fit_score INTEGER,
      last_all_floors_pass BOOLEAN,
      started_at TIMESTAMP DEFAULT NOW(),
      last_updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  return { success: true, message: 'Schema initialized' };
}

// Store a conversation turn
export async function storeTurn(sessionId, email, turnData) {
  const sql = getDb();

  // Get current turn count for this session
  const existing = await sql`
    SELECT COALESCE(MAX(turn_number), 0) as max_turn
    FROM conversations
    WHERE session_id = ${sessionId}
  `;
  const turnNumber = (existing[0]?.max_turn || 0) + 1;

  // Insert the turn
  await sql`
    INSERT INTO conversations (
      session_id, email, turn_number, user_message, ai_response,
      speech_act, dialogue_act, criteria, rubric_scores,
      fit_score, all_floors_pass, rationale
    ) VALUES (
      ${sessionId}, ${email || null}, ${turnNumber}, ${turnData.userMessage},
      ${turnData.response}, ${turnData.speechAct}, ${turnData.dialogueAct},
      ${JSON.stringify(turnData.criteria)}, ${JSON.stringify(turnData.rubricScores)},
      ${turnData.fitScore}, ${turnData.allFloorsPass}, ${turnData.rationale}
    )
  `;

  // Update or insert session metadata
  await sql`
    INSERT INTO session_metadata (session_id, email, turn_count, last_fit_score, last_all_floors_pass, last_updated_at)
    VALUES (${sessionId}, ${email || null}, ${turnNumber}, ${turnData.fitScore}, ${turnData.allFloorsPass}, NOW())
    ON CONFLICT (session_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, session_metadata.email),
      turn_count = EXCLUDED.turn_count,
      last_fit_score = EXCLUDED.last_fit_score,
      last_all_floors_pass = EXCLUDED.last_all_floors_pass,
      last_updated_at = NOW()
  `;

  return { turnNumber };
}

// Get conversation by session ID
export async function getConversation(sessionId) {
  const sql = getDb();

  const turns = await sql`
    SELECT * FROM conversations
    WHERE session_id = ${sessionId}
    ORDER BY turn_number ASC
  `;

  const metadata = await sql`
    SELECT * FROM session_metadata
    WHERE session_id = ${sessionId}
  `;

  return {
    sessionId,
    turns,
    metadata: metadata[0] || null,
    turnCount: turns.length
  };
}

// Get recent sessions (for admin)
export async function getRecentSessions(limit = 20) {
  const sql = getDb();

  const sessions = await sql`
    SELECT * FROM session_metadata
    ORDER BY last_updated_at DESC
    LIMIT ${limit}
  `;

  return sessions;
}

// Test database connection
export async function testConnection() {
  try {
    const sql = getDb();
    const result = await sql`SELECT NOW() as now`;
    return { connected: true, serverTime: result[0].now };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}
