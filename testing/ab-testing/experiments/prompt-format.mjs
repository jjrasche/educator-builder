/**
 * Prompt Format Experiment
 *
 * Compares persona card (natural language sections) vs JSON structured prompts.
 *
 * Hypothesis: Natural language persona cards will produce more consistent
 * character behavior and better dialogue quality, while JSON may have
 * fewer parse errors and more predictable outputs.
 *
 * Usage:
 *   node testing/ab-testing/experiments/prompt-format.mjs
 */

import { buildPersonaPrompt, buildJsonPrompt } from '../../persona-engine.mjs';

/**
 * Experiment definition
 */
export const experiment = {
  id: 'prompt-format',
  description: 'Compare persona card (NL sections) vs JSON structured prompts',

  variants: {
    'persona-card': {
      promptBuilder: buildPersonaPrompt,
      description: 'Natural language sections with labeled headers'
    },
    'json-structured': {
      promptBuilder: buildJsonPrompt,
      description: 'Raw JSON persona data in prompt'
    }
  },

  // Metrics to focus on for this experiment
  primaryMetrics: [
    'exitReason',      // Distribution of exit types
    'turnCount',       // Conversation length
    'finalTrust',      // Did persona build trust?
    'parseFailures'    // JSON parsing issues
  ],

  // What we expect to see
  hypotheses: [
    {
      metric: 'parseFailures',
      expected: 'json-structured <= persona-card',
      rationale: 'JSON structure may help LLM produce cleaner JSON output'
    },
    {
      metric: 'turnCount',
      expected: 'persona-card >= json-structured',
      rationale: 'Better character consistency may lead to longer engagement'
    },
    {
      metric: 'exitReason:satisfied',
      expected: 'persona-card >= json-structured',
      rationale: 'More natural dialogue may lead to more satisfied exits'
    }
  ],

  // Default run configuration
  runsPerVariant: 5,
  personas: ['jordan-taylor']
};

/**
 * CLI runner for this experiment
 */
async function main() {
  // Dynamic imports to avoid circular dependencies
  const { runExperiment, printExperimentReport } = await import('../framework.mjs');
  const { runSingleConversation, loadPersonas } = await import('../../run-personas.mjs');

  console.log('Loading experiment: prompt-format\n');

  // Load personas
  const personas = loadPersonas();
  const targetPersonas = personas.filter(p =>
    experiment.personas === 'all' || experiment.personas.includes(p.id)
  );

  if (targetPersonas.length === 0) {
    console.error('No matching personas found');
    process.exit(1);
  }

  // Create runner that uses the variant's prompt builder
  const runner = async ({ persona, variantId, variantConfig, runNumber }) => {
    return runSingleConversation(persona, {
      runNumber,
      promptBuilder: variantConfig.promptBuilder
    });
  };

  // Run experiment
  const results = await runExperiment(experiment, {
    runner,
    personas: targetPersonas
  });

  // Print report
  printExperimentReport(results);

  // Print hypothesis evaluation
  console.log('HYPOTHESIS EVALUATION:');
  console.log('-'.repeat(50));
  for (const h of experiment.hypotheses) {
    console.log(`  ${h.metric}: ${h.expected}`);
    console.log(`    Rationale: ${h.rationale}`);
    // TODO: Add actual evaluation based on results
    console.log();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
