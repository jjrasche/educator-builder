// Dashboard API for A/B test cohort comparison
import { getCohortComparison, getRecentSessions } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stats, stanceByFinalTurn } = await getCohortComparison();
    const recentSessions = await getRecentSessions(50);

    res.json({
      cohorts: stats.map(s => ({
        cohort: s.cohort,
        sessions: parseInt(s.sessions),
        totalTurns: parseInt(s.total_turns),
        avgFitScore: parseFloat(s.avg_fit_score)?.toFixed(1) || null,
        avgFirstTurnScore: parseFloat(s.avg_first_turn_score)?.toFixed(1) || null,
        pctAboveThreshold: parseFloat(s.pct_above_threshold)?.toFixed(1) || null,
        sessionsWithEmail: parseInt(s.sessions_with_email)
      })),
      stanceByFinalTurn: stanceByFinalTurn.map(s => ({
        cohort: s.cohort,
        avgOrientation: parseFloat(s.avg_orientation)?.toFixed(2) || null,
        avgAgency: parseFloat(s.avg_agency)?.toFixed(2) || null,
        avgCertainty: parseFloat(s.avg_certainty)?.toFixed(2) || null
      })),
      recentSessions: recentSessions.map(s => ({
        sessionId: s.session_id,
        cohort: s.cohort,
        email: s.email,
        turnCount: parseInt(s.turn_count),
        maxFitScore: parseInt(s.max_fit_score) || null,
        startedAt: s.started_at,
        lastActivity: s.last_activity
      }))
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard', details: error.message });
  }
}
