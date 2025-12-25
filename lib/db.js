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
    await sql`DROP TABLE IF EXISTS sessions CASCADE`;
    await sql`DROP TABLE IF EXISTS preference_data CASCADE`;
    await sql`DROP TABLE IF EXISTS conversations CASCADE`;
    await sql`DROP TABLE IF EXISTS session_metadata CASCADE`;
  }

  // Sessions table - stores cohort assignment per session
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id VARCHAR(255) PRIMARY KEY,
      cohort VARCHAR(100) NOT NULL,
      config_id VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_cohort ON sessions(cohort)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC)`;

  // Turns table - stores each conversation turn
  await sql`
    CREATE TABLE IF NOT EXISTS turns (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(255) NOT NULL,
      cohort VARCHAR(100),
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
  await sql`CREATE INDEX IF NOT EXISTS idx_turns_cohort ON turns(cohort) WHERE cohort IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_turns_email ON turns(email) WHERE email IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_turns_created ON turns(created_at DESC)`;

  // Preference data table - stores dialogue act grading feedback
  await sql`
    CREATE TABLE IF NOT EXISTS preference_data (
      id SERIAL PRIMARY KEY,
      turn_id INTEGER REFERENCES turns(id) UNIQUE,
      session_id VARCHAR(255),
      user_message TEXT NOT NULL,
      original_dialogue_act VARCHAR(50) NOT NULL,
      selected_dialogue_act VARCHAR(50),
      matched BOOLEAN NOT NULL,
      skipped BOOLEAN DEFAULT false,
      graded_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_preference_matched ON preference_data(matched)`;

  return { success: true, message: force ? 'Schema recreated' : 'Schema initialized' };
}

// A/B Test Configuration
const AB_CONFIG = {
  cohorts: [
    { id: 'live-in-collaborator', weight: 50 },
    { id: 'educator-facilitator', weight: 50 }
  ],
  // Set to a single cohort ID to disable A/B and force everyone to that variant
  forceAll: null  // e.g., 'live-in-collaborator' to kill test
};

// Deterministic cohort assignment based on sessionId hash
// Same sessionId always gets same cohort (reproducible)
function assignCohort(sessionId) {
  // If kill switch is set, return that cohort
  if (AB_CONFIG.forceAll) {
    return AB_CONFIG.forceAll;
  }

  // Simple hash function for deterministic assignment
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const bucket = Math.abs(hash) % 100;

  // Assign based on weights
  let cumulative = 0;
  for (const cohort of AB_CONFIG.cohorts) {
    cumulative += cohort.weight;
    if (bucket < cumulative) {
      return cohort.id;
    }
  }
  return AB_CONFIG.cohorts[0].id; // Fallback
}

// Get or create session with cohort assignment
// Uses INSERT ... ON CONFLICT to prevent race conditions
export async function getOrCreateSession(sessionId, forceCohort = null) {
  const sql = getDb();

  // Determine cohort (forced > hash-based assignment)
  const cohort = forceCohort || assignCohort(sessionId);
  const configId = `llm-config-${cohort}.json`;

  // Atomic upsert - prevents race condition
  const result = await sql`
    INSERT INTO sessions (session_id, cohort, config_id)
    VALUES (${sessionId}, ${cohort}, ${configId})
    ON CONFLICT (session_id) DO UPDATE SET session_id = sessions.session_id
    RETURNING session_id, cohort, config_id, created_at
  `;

  return result[0];
}

// Get session cohort (returns null if session doesn't exist)
export async function getSessionCohort(sessionId) {
  const sql = getDb();

  const result = await sql`
    SELECT cohort, config_id FROM sessions WHERE session_id = ${sessionId}
  `;

  return result.length > 0 ? result[0] : null;
}

// Store a turn (now includes cohort)
export async function storeTurn(sessionId, email, turnData, cohort = null) {
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
    stance: turnData.stance || null,
    vibe: turnData.vibe || null  // { emoji, observation } if voice mode
  };

  // Voice signals (optional)
  const voiceSignals = turnData.voiceSignals || null;

  await sql`
    INSERT INTO turns (session_id, cohort, email, turn_number, user_message, ai_response, evaluation, voice_signals)
    VALUES (
      ${sessionId},
      ${cohort},
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
      cohort,
      email,
      COUNT(*) as turn_count,
      MAX(created_at) as last_activity,
      MIN(created_at) as started_at,
      MAX((evaluation->>'fitScore')::int) as max_fit_score
    FROM turns
    GROUP BY session_id, cohort, email
    ORDER BY last_activity DESC
    LIMIT ${limit}
  `;

  return sessions;
}

// Dashboard: Compare cohorts for A/B testing
export async function getCohortComparison() {
  const sql = getDb();

  // Aggregate stats per cohort
  const stats = await sql`
    SELECT
      cohort,
      COUNT(DISTINCT session_id) as sessions,
      COUNT(*) as total_turns,
      AVG((evaluation->>'fitScore')::float) as avg_fit_score,
      AVG(CASE WHEN turn_number = 1 THEN (evaluation->>'fitScore')::float END) as avg_first_turn_score,
      AVG(CASE WHEN (evaluation->>'fitScore')::int >= 60 THEN 1 ELSE 0 END) * 100 as pct_above_threshold,
      COUNT(DISTINCT CASE WHEN email IS NOT NULL THEN session_id END) as sessions_with_email
    FROM turns
    WHERE cohort IS NOT NULL
    GROUP BY cohort
  `;

  // Stance distribution per cohort (final turn per session)
  const stanceByFinalTurn = await sql`
    WITH final_turns AS (
      SELECT DISTINCT ON (session_id)
        session_id, cohort, evaluation
      FROM turns
      WHERE cohort IS NOT NULL
      ORDER BY session_id, turn_number DESC
    )
    SELECT
      cohort,
      AVG((evaluation->'stance'->>'orientation')::float) as avg_orientation,
      AVG((evaluation->'stance'->>'agency')::float) as avg_agency,
      AVG((evaluation->'stance'->>'certainty')::float) as avg_certainty
    FROM final_turns
    GROUP BY cohort
  `;

  return { stats, stanceByFinalTurn };
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
