import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = neon(process.env.DATABASE_URL);
  const {
    turn_id,
    session_id,
    user_message,
    original_dialogue_act,
    selected_dialogue_act,
    matched,
    skipped = false
  } = req.body;

  // Validate required fields
  if (!turn_id || !original_dialogue_act || matched === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await sql`
      INSERT INTO preference_data (
        turn_id,
        session_id,
        user_message,
        original_dialogue_act,
        selected_dialogue_act,
        matched,
        skipped
      )
      VALUES (
        ${turn_id},
        ${session_id},
        ${user_message},
        ${original_dialogue_act},
        ${selected_dialogue_act},
        ${matched},
        ${skipped}
      )
      ON CONFLICT (turn_id) DO NOTHING
    `;

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving grade:', error);
    res.status(500).json({ error: 'Failed to save grade' });
  }
}
