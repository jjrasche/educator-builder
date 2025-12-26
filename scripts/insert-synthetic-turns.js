import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const syntheticTurns = [
  // Test 1: Abstract language (authenticity test)
  {
    session_id: 'synthetic_test_001',
    cohort: 'live-in-collaborator',
    turn_number: 1,
    source: 'synthetic',
    user_message: "I'm interested in the intersection of relational infrastructure and transformative ontological frameworks.",
    ai_response: 'That\'s interesting. Can you give me a concrete example of what you mean?',
    evaluation: {
      speechAct: 'directive',
      dialogueAct: 'ask_for_concrete',
      criteria: ['authenticity'],
      rubricScores: {
        'depth-of-questioning': 5,
        'self-awareness': 4,
        'systems-thinking': 6,
        'experimentation-evidence': 3,
        authenticity: 2,
        'reciprocal-curiosity': 3,
        'family-integration': 5
      },
      fitScore: 35,
      allFloorsPass: false,
      rationale: 'User uses jargon without grounding. High abstract language risk.'
    }
  },

  // Test 2: Genuine curiosity (reciprocal dialogue)
  {
    session_id: 'synthetic_test_001',
    cohort: 'live-in-collaborator',
    turn_number: 2,
    source: 'synthetic',
    user_message: 'What made you decide to create this experiment? What are you personally hoping to learn from it?',
    ai_response: 'Great question. I\'m curious about whether we can build something that works for real people.',
    evaluation: {
      speechAct: 'directive',
      dialogueAct: 'open_with_question',
      criteria: ['reciprocal-curiosity', 'depth-of-questioning'],
      rubricScores: {
        'depth-of-questioning': 7,
        'self-awareness': 6,
        'systems-thinking': 5,
        'experimentation-evidence': 6,
        authenticity: 7,
        'reciprocal-curiosity': 8,
        'family-integration': 5
      },
      fitScore: 72,
      allFloorsPass: true,
      rationale: 'User asks about organizer thinking. Shows reciprocal curiosity.'
    }
  },

  // Test 3: Evidence of doing (experimentation)
  {
    session_id: 'synthetic_test_002',
    cohort: 'live-in-collaborator',
    turn_number: 1,
    source: 'synthetic',
    user_message: 'I built a community garden with 12 families last year. We learned a lot about food systems.',
    ai_response: 'That\'s real experience. What was the biggest learning?',
    evaluation: {
      speechAct: 'directive',
      dialogueAct: 'probe_deeper',
      criteria: ['experimentation-evidence', 'depth-of-questioning'],
      rubricScores: {
        'depth-of-questioning': 6,
        'self-awareness': 5,
        'systems-thinking': 6,
        'experimentation-evidence': 8,
        authenticity: 8,
        'reciprocal-curiosity': 4,
        'family-integration': 6
      },
      fitScore: 68,
      allFloorsPass: true,
      rationale: 'User shows concrete evidence of building. Strong authenticity.'
    }
  },

  // Test 4: Family context discomfort (critical floor)
  {
    session_id: 'synthetic_test_002',
    cohort: 'live-in-collaborator',
    turn_number: 2,
    source: 'synthetic',
    user_message: 'How much time would I need to spend around the kids? I need quiet space to focus.',
    ai_response: 'The household includes two young children. Can you see yourself coexisting peacefully with that?',
    evaluation: {
      speechAct: 'directive',
      dialogueAct: 'validate_genuine',
      criteria: ['family-integration'],
      rubricScores: {
        'depth-of-questioning': 3,
        'self-awareness': 4,
        'systems-thinking': 3,
        'experimentation-evidence': 2,
        authenticity: 5,
        'reciprocal-curiosity': 2,
        'family-integration': 2
      },
      fitScore: 28,
      allFloorsPass: false,
      rationale: 'Family-integration floor not met (need 4+). Resentment signal detected.'
    }
  },

  // Test 5: Logistics focused (surface level)
  {
    session_id: 'synthetic_test_003',
    cohort: 'educator-facilitator',
    turn_number: 1,
    source: 'synthetic',
    user_message: "What's the pay? How many hours exactly?",
    ai_response: "No direct salary. It's housing, food, and shared expenses. 10 hours minimum per week.",
    evaluation: {
      speechAct: 'assertive',
      dialogueAct: 'redirect_from_surface',
      criteria: ['depth-of-questioning'],
      rubricScores: {
        'depth-of-questioning': 2,
        'self-awareness': 3,
        'systems-thinking': 2,
        'experimentation-evidence': 2,
        authenticity: 4,
        'reciprocal-curiosity': 1,
        'family-integration': 5
      },
      fitScore: 25,
      allFloorsPass: false,
      rationale: 'User stuck on logistics. Need to surface motivation.'
    }
  }
];

async function insertSynthetic() {
  try {
    for (const turn of syntheticTurns) {
      await sql`
        INSERT INTO turns (
          session_id, cohort, turn_number, source,
          user_message, ai_response, evaluation, created_at
        )
        VALUES (
          ${turn.session_id}, ${turn.cohort}, ${turn.turn_number}, ${turn.source},
          ${turn.user_message}, ${turn.ai_response}, ${JSON.stringify(turn.evaluation)}, NOW()
        )
        ON CONFLICT (session_id, turn_number) DO NOTHING
      `;
    }

    console.log(`✓ Inserted ${syntheticTurns.length} synthetic test scenarios`);
    console.log('\nScenarios created:');
    console.log('1. Abstract language (jargon) - authenticity test');
    console.log('2. Reciprocal curiosity - good engagement');
    console.log('3. Evidence of doing (community garden) - strong fit');
    console.log('4. Family discomfort - critical floor violation');
    console.log('5. Logistics focused - surface level engagement');
    console.log('\nTo grade synthetic turns:');
    console.log('  http://localhost:3000/grade.html?source=synthetic');
    console.log('\nTo grade real turns:');
    console.log('  http://localhost:3000/grade.html (or ?source=real)');
  } catch (error) {
    console.error('Error inserting synthetic turns:', error);
    process.exit(1);
  }
}

insertSynthetic();
