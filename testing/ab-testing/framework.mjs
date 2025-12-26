/**
 * A/B Testing Framework
 *
 * Generic framework for running experiments with multiple variants.
 * Designed to test hypotheses about persona prompts, chat behaviors, etc.
 *
 * Usage:
 *   import { runExperiment, printExperimentReport } from './framework.mjs';
 *
 *   const experiment = {
 *     id: 'prompt-format',
 *     description: 'Compare persona card vs JSON structured prompts',
 *     variants: {
 *       'persona-card': { promptBuilder: buildPersonaCardPrompt },
 *       'json-structured': { promptBuilder: buildJsonPrompt }
 *     },
 *     runsPerVariant: 10,
 *     personas: ['jordan-taylor']  // or 'all'
 *   };
 *
 *   const results = await runExperiment(experiment, { runner });
 *   printExperimentReport(results);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { aggregateMetrics, compareMetrics, interpretEffectSize } from './metrics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results');

/**
 * Experiment definition schema
 * @typedef {Object} Experiment
 * @property {string} id - Unique experiment identifier
 * @property {string} description - Human-readable description
 * @property {Object.<string, VariantConfig>} variants - Variant configurations
 * @property {number} runsPerVariant - Number of runs per variant per persona
 * @property {Array<string>|'all'} personas - Persona IDs to test, or 'all'
 */

/**
 * Variant configuration
 * @typedef {Object} VariantConfig
 * @property {Function} [promptBuilder] - Custom prompt builder function
 * @property {Object} [config] - Additional config passed to runner
 */

/**
 * Run an A/B experiment
 * @param {Experiment} experiment - Experiment definition
 * @param {Object} options
 * @param {Function} options.runner - Function to run a single conversation
 * @param {Array<Object>} options.personas - Available personas
 * @param {boolean} [options.saveResults=true] - Whether to save results to disk
 * @returns {Object} Experiment results
 */
export async function runExperiment(experiment, options) {
  const { runner, personas: availablePersonas, saveResults = true } = options;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`EXPERIMENT: ${experiment.id}`);
  console.log(`${experiment.description}`);
  console.log(`${'='.repeat(70)}\n`);

  // Resolve personas
  let personaIds = experiment.personas;
  if (personaIds === 'all') {
    personaIds = availablePersonas.map(p => p.id);
  }

  const targetPersonas = availablePersonas.filter(p => personaIds.includes(p.id));

  if (targetPersonas.length === 0) {
    throw new Error(`No matching personas found for: ${personaIds.join(', ')}`);
  }

  console.log(`Personas: ${targetPersonas.map(p => p.id).join(', ')}`);
  console.log(`Variants: ${Object.keys(experiment.variants).join(', ')}`);
  console.log(`Runs per variant: ${experiment.runsPerVariant}`);
  console.log();

  const results = {
    experimentId: experiment.id,
    description: experiment.description,
    startedAt: new Date().toISOString(),
    variants: {},
    comparison: null
  };

  // Run each variant
  for (const [variantId, variantConfig] of Object.entries(experiment.variants)) {
    console.log(`\n--- Running variant: ${variantId} ---\n`);

    results.variants[variantId] = {
      runs: [],
      aggregated: null
    };

    for (const persona of targetPersonas) {
      for (let run = 1; run <= experiment.runsPerVariant; run++) {
        const runLabel = `${persona.id} run ${run}/${experiment.runsPerVariant}`;
        console.log(`  [${variantId}] ${runLabel}...`);

        try {
          const runResult = await runner({
            persona,
            variantId,
            variantConfig,
            runNumber: run
          });

          runResult.variantId = variantId;
          runResult.personaId = persona.id;
          runResult.runNumber = run;

          results.variants[variantId].runs.push(runResult);
          console.log(`    -> ${runResult.exitReason} after ${runResult.turnCount} turns`);
        } catch (error) {
          console.error(`    -> ERROR: ${error.message}`);
          results.variants[variantId].runs.push({
            variantId,
            personaId: persona.id,
            runNumber: run,
            error: error.message,
            exitReason: 'error',
            turnCount: 0
          });
        }
      }
    }

    // Aggregate this variant's results
    results.variants[variantId].aggregated = aggregateMetrics(
      results.variants[variantId].runs
    );
  }

  // Compare variants (if exactly 2)
  const variantIds = Object.keys(experiment.variants);
  if (variantIds.length === 2) {
    results.comparison = compareMetrics(
      results.variants[variantIds[0]].aggregated,
      results.variants[variantIds[1]].aggregated
    );
    results.comparison.variantA = variantIds[0];
    results.comparison.variantB = variantIds[1];
  }

  results.completedAt = new Date().toISOString();

  // Save results
  if (saveResults) {
    const filename = `${experiment.id}-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(RESULTS_DIR, filename);

    // Ensure results directory exists
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }

    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${filepath}`);
  }

  return results;
}

/**
 * Print a formatted experiment report
 * @param {Object} results - Results from runExperiment
 */
export function printExperimentReport(results) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('EXPERIMENT REPORT');
  console.log(`${'='.repeat(70)}`);
  console.log(`Experiment: ${results.experimentId}`);
  console.log(`Description: ${results.description}`);
  console.log(`Started: ${results.startedAt}`);
  console.log(`Completed: ${results.completedAt}`);

  // Per-variant summaries
  for (const [variantId, variantData] of Object.entries(results.variants)) {
    console.log(`\n--- Variant: ${variantId} ---`);
    const agg = variantData.aggregated;

    console.log(`Total runs: ${agg.count}`);

    console.log('\nExit Reasons:');
    for (const [reason, count] of Object.entries(agg.exitReasons || {})) {
      const pct = ((count / agg.count) * 100).toFixed(1);
      console.log(`  ${reason.padEnd(15)} ${count} (${pct}%)`);
    }

    console.log('\nKey Stats:');
    const keyStats = ['turnCount', 'finalTrust', 'finalFrustration', 'parseFailures'];
    for (const stat of keyStats) {
      if (agg.stats?.[stat]) {
        const s = agg.stats[stat];
        console.log(`  ${stat.padEnd(20)} mean=${s.mean}, stdDev=${s.stdDev}, range=[${s.min}, ${s.max}]`);
      }
    }
  }

  // Comparison (if available)
  if (results.comparison) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('COMPARISON: A vs B');
    console.log(`${'='.repeat(70)}`);
    console.log(`A = ${results.comparison.variantA}`);
    console.log(`B = ${results.comparison.variantB}`);

    console.log('\nExit Reason Differences (B - A):');
    for (const [reason, data] of Object.entries(results.comparison.exitReasonComparison)) {
      const diffStr = data.diff > 0 ? `+${data.diff.toFixed(1)}%` : `${data.diff.toFixed(1)}%`;
      console.log(`  ${reason.padEnd(15)} A=${data.a.pct}% B=${data.b.pct}% (${diffStr})`);
    }

    console.log('\nStat Differences:');
    for (const [stat, data] of Object.entries(results.comparison.statComparison)) {
      const interpretation = interpretEffectSize(data.effectSize);
      console.log(`  ${stat.padEnd(20)} A=${data.a.mean} B=${data.b.mean} diff=${data.meanDiff} effect=${interpretation}`);
    }
  }

  console.log(`\n${'='.repeat(70)}\n`);
}

/**
 * Load experiment results from disk
 * @param {string} experimentId - Experiment ID
 * @param {string} [date] - Optional date (YYYY-MM-DD), defaults to most recent
 * @returns {Object|null} Results or null if not found
 */
export function loadExperimentResults(experimentId, date) {
  if (!fs.existsSync(RESULTS_DIR)) {
    return null;
  }

  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith(experimentId) && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  const targetFile = date
    ? files.find(f => f.includes(date))
    : files[0];

  if (!targetFile) {
    return null;
  }

  const content = fs.readFileSync(path.join(RESULTS_DIR, targetFile), 'utf-8');
  return JSON.parse(content);
}
