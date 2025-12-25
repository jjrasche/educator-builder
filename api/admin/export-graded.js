import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    const results = await sql`
      SELECT
        user_message,
        original_dialogue_act,
        selected_dialogue_act,
        matched
      FROM preference_data
      WHERE NOT skipped
      ORDER BY graded_at DESC
    `;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=graded-examples.json');
    res.status(200).json(results);
  } catch (error) {
    console.error('Error exporting graded data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
}
