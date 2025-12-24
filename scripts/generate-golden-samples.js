#!/usr/bin/env node
/**
 * Generate sample conversations for golden dataset curation
 * Runs REAL Groq API calls (not mocked) to capture actual LLM responses
 */

const BASE_URL = 'http://localhost:3000';

// Sample user inputs representing different personas/intents
const SAMPLE_INPUTS = [
  // Opening messages
  { category: 'opening', input: "Hi, I saw this role and I'm curious" },
  { category: 'opening', input: "What exactly is this about?" },
  { category: 'opening', input: "I'm interested in the live-in position" },

  // Deep/philosophical
  { category: 'deep', input: "I've been thinking a lot about how we organize society. The way we work feels broken - we trade our time for money but never build anything lasting." },
  { category: 'deep', input: "I want to build community, not just have a job. I believe in creating spaces where people actually care about each other." },
  { category: 'deep', input: "Freedom means something different than just financial independence to me. It's about having agency over how I spend my days." },

  // Surface/transactional
  { category: 'surface', input: "How much does it pay?" },
  { category: 'surface', input: "What are the hours? Is it remote?" },
  { category: 'surface', input: "What benefits do you offer?" },

  // Skeptical
  { category: 'skeptical', input: "This sounds too good to be true. What's the catch?" },
  { category: 'skeptical', input: "I've heard about these 'intentional community' things before. Most of them fail." },

  // Enthusiastic but vague
  { category: 'vague', input: "Oh my god this is exactly what I've been looking for! The energy here is amazing!" },
  { category: 'vague', input: "I'm totally aligned with the vision. We need to shift the paradigm." },

  // Specific and grounded
  { category: 'grounded', input: "I built a community garden in my neighborhood last year. We had 40 families participating by the end. I learned a lot about what makes people actually show up." },
  { category: 'grounded', input: "I've been doing software development for 5 years but I spend my weekends building furniture and growing vegetables. I want to integrate these things." },
];

async function sendMessage(input, sessionId) {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: input }],
      sessionId
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  // Parse SSE response
  const text = await response.text();
  const lines = text.split('\n').filter(l => l.startsWith('data: '));

  let aiResponse = '';
  let metadata = null;

  for (const line of lines) {
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed.text) aiResponse = parsed.text;
      if (parsed.type === 'metadata') metadata = parsed;
    } catch (e) {}
  }

  return { aiResponse, metadata };
}

async function generateSamples() {
  console.log('Generating golden dataset samples...\n');
  console.log('=' .repeat(80));

  const samples = [];

  for (const sample of SAMPLE_INPUTS) {
    const sessionId = `golden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      console.log(`\n[${sample.category.toUpperCase()}]`);
      console.log(`USER: ${sample.input}`);

      const { aiResponse, metadata } = await sendMessage(sample.input, sessionId);

      console.log(`AI: ${aiResponse}`);
      if (metadata) {
        console.log(`  → speechAct: ${metadata.speechAct}, dialogueAct: ${metadata.dialogueAct}`);
        console.log(`  → fitScore: ${metadata.fitScore}`);
      }
      console.log('-'.repeat(80));

      samples.push({
        category: sample.category,
        userInput: sample.input,
        aiResponse,
        metadata: metadata ? {
          speechAct: metadata.speechAct,
          dialogueAct: metadata.dialogueAct,
          fitScore: metadata.fitScore,
          rubricScores: metadata.rubricScores
        } : null,
        timestamp: new Date().toISOString()
      });

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      console.log(`ERROR: ${error.message}`);
    }
  }

  // Save to file
  const fs = await import('fs');
  const outputPath = 'golden-cases/samples-for-review.json';

  // Create directory if needed
  fs.mkdirSync('golden-cases', { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(samples, null, 2));

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Generated ${samples.length} samples`);
  console.log(`Saved to: ${outputPath}`);
  console.log(`\nNext: Review samples and provide feedback to create golden dataset`);
}

generateSamples().catch(console.error);
