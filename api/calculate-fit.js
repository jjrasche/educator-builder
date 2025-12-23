// Calculate fit score from criteria scores
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { criteriaScores } = req.body;

  if (!criteriaScores || typeof criteriaScores !== 'object') {
    return res.status(400).json({ error: 'Invalid criteriaScores format' });
  }

  try {
    // Load rubric for weights and floors
    const rubricPath = path.join(process.cwd(), 'data', 'rubric-v1.json');
    const rubricData = fs.readFileSync(rubricPath, 'utf-8');
    const rubric = JSON.parse(rubricData);

    // Calculate fit
    const result = calculateFit(criteriaScores, rubric);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Fit calculation error:', error);
    return res.status(500).json({
      error: 'Fit calculation failed',
      details: error.message
    });
  }
}

function calculateFit(criteriaScores, rubric) {
  // Check if all floors pass
  let floorsPass = true;
  const floorBreaches = [];

  for (const criterion of rubric.criteria) {
    const score = criteriaScores[criterion.id];
    if (score < criterion.floor) {
      floorsPass = false;
      floorBreaches.push(criterion.id);
    }
  }

  // Calculate weighted fit score
  let weightedSum = 0;
  let weightSum = 0;

  for (const criterion of rubric.criteria) {
    const score = criteriaScores[criterion.id] || 5; // Default to 5 if missing
    weightedSum += score * criterion.weight;
    weightSum += criterion.weight;
  }

  const fitScore = Math.round((weightedSum / weightSum) * 10);

  // Identify strengths and areas to explore
  const strengths = [];
  const areasToExplore = [];

  for (const criterion of rubric.criteria) {
    const score = criteriaScores[criterion.id] || 5;
    if (score >= 7) {
      strengths.push(criterion.id);
    }
    if (score < 6) {
      areasToExplore.push(criterion.id);
    }
  }

  return {
    fitScore,
    floorsPass,
    canUnlockEmail: fitScore >= rubric.overallPassThreshold && floorsPass,
    strengths,
    areasToExplore,
    floorBreaches
  };
}
