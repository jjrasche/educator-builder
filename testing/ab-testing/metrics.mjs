/**
 * Metrics extraction module
 *
 * Extractable metrics for A/B testing, dashboard, and analysis.
 * Designed to be reusable across different contexts.
 */

/**
 * Extract metrics from a single conversation run result
 * @param {Object} result - Run result from persona engine
 * @returns {Object} Extracted metrics
 */
export function extractRunMetrics(result) {
  return {
    // Core outcomes
    exitReason: result.exitReason || 'unknown',
    turnCount: result.turnCount || 0,

    // Final emotional state
    finalTrust: result.finalState?.trust ?? null,
    finalEngagement: result.finalState?.engagement ?? null,
    finalFrustration: result.finalState?.frustration ?? null,
    finalConnection: result.finalState?.connection ?? null,
    finalQuestionsAnswered: result.finalState?.questionsAnswered ?? null,
    finalGoalProgress: result.finalState?.goalProgress ?? null,

    // Parse/error tracking
    parseFailures: result.parseFailures || 0,
    errors: result.errors || [],

    // Timing
    durationMs: result.durationMs || null,

    // Metadata
    personaId: result.personaId,
    timestamp: result.timestamp || new Date().toISOString()
  };
}

/**
 * Aggregate metrics across multiple runs
 * @param {Array} results - Array of run results
 * @returns {Object} Aggregated metrics with stats
 */
export function aggregateMetrics(results) {
  if (results.length === 0) {
    return { count: 0, metrics: {} };
  }

  const metrics = results.map(extractRunMetrics);

  // Exit reason distribution
  const exitReasons = {};
  for (const m of metrics) {
    exitReasons[m.exitReason] = (exitReasons[m.exitReason] || 0) + 1;
  }

  // Numeric aggregations
  const numericFields = [
    'turnCount', 'finalTrust', 'finalEngagement', 'finalFrustration',
    'finalConnection', 'finalQuestionsAnswered', 'finalGoalProgress',
    'parseFailures', 'durationMs'
  ];

  const stats = {};
  for (const field of numericFields) {
    const values = metrics.map(m => m[field]).filter(v => v !== null && v !== undefined);
    if (values.length > 0) {
      stats[field] = computeStats(values);
    }
  }

  return {
    count: results.length,
    exitReasons,
    stats
  };
}

/**
 * Compute basic statistics for an array of numbers
 * @param {Array<number>} values
 * @returns {Object} { mean, stdDev, min, max, median }
 */
export function computeStats(values) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;

  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  return {
    mean: Number(mean.toFixed(3)),
    stdDev: Number(stdDev.toFixed(3)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: Number(median.toFixed(3)),
    n: values.length
  };
}

/**
 * Compare two sets of metrics (for A/B testing)
 * @param {Object} metricsA - Aggregated metrics for variant A
 * @param {Object} metricsB - Aggregated metrics for variant B
 * @returns {Object} Comparison results
 */
export function compareMetrics(metricsA, metricsB) {
  const comparison = {
    sampleSizes: { a: metricsA.count, b: metricsB.count },
    exitReasonComparison: {},
    statComparison: {}
  };

  // Compare exit reason distributions
  const allReasons = new Set([
    ...Object.keys(metricsA.exitReasons || {}),
    ...Object.keys(metricsB.exitReasons || {})
  ]);

  for (const reason of allReasons) {
    const countA = metricsA.exitReasons?.[reason] || 0;
    const countB = metricsB.exitReasons?.[reason] || 0;
    const pctA = metricsA.count > 0 ? (countA / metricsA.count * 100).toFixed(1) : 0;
    const pctB = metricsB.count > 0 ? (countB / metricsB.count * 100).toFixed(1) : 0;

    comparison.exitReasonComparison[reason] = {
      a: { count: countA, pct: Number(pctA) },
      b: { count: countB, pct: Number(pctB) },
      diff: Number(pctB) - Number(pctA)
    };
  }

  // Compare numeric stats
  const allStats = new Set([
    ...Object.keys(metricsA.stats || {}),
    ...Object.keys(metricsB.stats || {})
  ]);

  for (const stat of allStats) {
    const statsA = metricsA.stats?.[stat];
    const statsB = metricsB.stats?.[stat];

    if (statsA && statsB) {
      comparison.statComparison[stat] = {
        a: statsA,
        b: statsB,
        meanDiff: Number((statsB.mean - statsA.mean).toFixed(3)),
        // Basic effect size (Cohen's d approximation)
        effectSize: computeEffectSize(statsA, statsB)
      };
    }
  }

  return comparison;
}

/**
 * Compute Cohen's d effect size
 * @param {Object} statsA
 * @param {Object} statsB
 * @returns {number|null}
 */
function computeEffectSize(statsA, statsB) {
  if (!statsA?.stdDev || !statsB?.stdDev) return null;

  // Pooled standard deviation
  const pooledStdDev = Math.sqrt(
    (Math.pow(statsA.stdDev, 2) + Math.pow(statsB.stdDev, 2)) / 2
  );

  if (pooledStdDev === 0) return 0;

  const d = (statsB.mean - statsA.mean) / pooledStdDev;
  return Number(d.toFixed(3));
}

/**
 * Interpret effect size
 * @param {number} d - Cohen's d
 * @returns {string} Interpretation
 */
export function interpretEffectSize(d) {
  if (d === null) return 'N/A';
  const abs = Math.abs(d);
  if (abs < 0.2) return 'negligible';
  if (abs < 0.5) return 'small';
  if (abs < 0.8) return 'medium';
  return 'large';
}
