// Run all personas through the chat API multiple times
// Collects results for golden dataset analysis

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const RUNS_PER_PERSONA = 5;

const personas = [
  'philosophical-thinker',
  'transactional-seeker',
  'performative-philosopher',
  'authentic-inarticulate',
  'builder-experimenter',
  'systems-thinker'
];

async function runPersona(personaId, runNumber) {
  const personaPath = path.join(process.cwd(), 'testing', 'personas', `${personaId}.json`);
  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));

  const sessionId = `test-${personaId}-run${runNumber}-${Date.now()}`;
  const messages = [];
  const turns = [];

  console.log(`\n  Run ${runNumber}: ${persona.name}`);

  for (const sample of persona.sampleUtterances) {
    messages.push({ role: 'user', content: sample.utterance });

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, sessionId })
      });

      const text = await response.text();

      // Parse SSE response
      let aiResponse = '';
      let metadata = null;

      for (const line of text.split('\n')) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) aiResponse = data.text;
            if (data.type === 'metadata') metadata = data;
          } catch (e) {}
        }
      }

      messages.push({ role: 'assistant', content: aiResponse });

      turns.push({
        turn: sample.turn,
        userMessage: sample.utterance,
        aiResponse: aiResponse.substring(0, 150) + (aiResponse.length > 150 ? '...' : ''),
        fitScore: metadata?.fitScore,
        dialogueAct: metadata?.dialogueAct,
        speechAct: metadata?.speechAct,
        allFloorsPass: metadata?.allFloorsPass,
        rubricScores: metadata?.rubricScores
      });

      console.log(`    Turn ${sample.turn}: fitScore=${metadata?.fitScore}, dialogueAct=${metadata?.dialogueAct}`);

    } catch (error) {
      console.error(`    Turn ${sample.turn}: ERROR - ${error.message}`);
      turns.push({ turn: sample.turn, error: error.message });
    }
  }

  return {
    personaId,
    personaName: persona.name,
    runNumber,
    sessionId,
    expectedDialogueActs: persona.expectedDialogueActs,
    targetRubricDimensions: persona.targetRubricDimensions,
    tier: persona.tier,
    turns,
    finalFitScore: turns[turns.length - 1]?.fitScore,
    timestamp: new Date().toISOString()
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('PERSONA TEST RUN - Golden Dataset Collection');
  console.log(`API: ${API_URL}`);
  console.log(`Runs per persona: ${RUNS_PER_PERSONA}`);
  console.log('='.repeat(70));

  const allResults = [];

  for (const personaId of personas) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`PERSONA: ${personaId}`);
    console.log('─'.repeat(70));

    for (let run = 1; run <= RUNS_PER_PERSONA; run++) {
      const result = await runPersona(personaId, run);
      allResults.push(result);

      // Small delay between runs
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Save results
  const outputPath = path.join(process.cwd(), 'testing', `persona-runs-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  // Analyze by persona
  for (const personaId of personas) {
    const runs = allResults.filter(r => r.personaId === personaId);
    const scores = runs.map(r => r.finalFitScore).filter(s => s != null);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
    const min = scores.length ? Math.min(...scores) : 'N/A';
    const max = scores.length ? Math.max(...scores) : 'N/A';

    console.log(`\n${personaId}:`);
    console.log(`  Final fitScore: avg=${avg}, min=${min}, max=${max}`);
    console.log(`  Scores: [${scores.join(', ')}]`);
  }

  console.log(`\nResults saved to: ${outputPath}`);

  return allResults;
}

main().catch(console.error);
