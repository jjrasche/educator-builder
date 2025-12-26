import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = neon(process.env.DATABASE_URL);
  const limit = parseInt(req.query.limit || '30');
  const source = req.query.source || 'real'; // 'real' or 'synthetic'

  try {
    const queue = await sql`
      SELECT
        t.id as turn_id,
        t.session_id,
        t.source,
        t.user_message,
        t.evaluation->>'dialogueAct' as dialogue_act
      FROM turns t
      WHERE t.id NOT IN (SELECT turn_id FROM preference_data)
        AND t.evaluation IS NOT NULL
        AND t.evaluation->>'dialogueAct' IS NOT NULL
        AND t.source = ${source}
        AND t.created_at > NOW() - INTERVAL '30 days'
      ORDER BY RANDOM()
      LIMIT ${limit}
    `;

    res.status(200).json(queue);
  } catch (error) {
    console.error('Error fetching grading queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
}
