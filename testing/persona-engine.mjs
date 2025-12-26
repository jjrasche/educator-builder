/**
 * Persona Engine v1.0
 *
 * Research basis:
 * - Emotional Inertia (Kuppens et al., 2010) - emotions persist over time
 * - Synthetic-Emotion-Engine - 12-factor → 4-emotion architecture
 * - Stanford Persona Replication - 85% accuracy benchmarks
 * - DeepPersona - validation methodology
 *
 * Architecture:
 * - 8 conversation-specific factors (continuous 0-1)
 * - LLM reports binary reactions
 * - Code applies reaction weights with inertia blending
 * - Probabilistic exit based on persona-specific thresholds
 */

// ========== CONSTANTS ==========

export const FACTORS = [
  'questionsAnswered',
  'feltHeard',
  'trust',
  'engagement',
  'frustration',
  'connection',
  'goalProgress',
  'novelty'
];

export const POSITIVE_FACTORS = [
  'questionsAnswered',
  'feltHeard',
  'trust',
  'engagement',
  'connection',
  'goalProgress',
  'novelty'
];

export const NEGATIVE_FACTORS = [
  'frustration'
];

export const EXIT_TYPES = [
  'satisfied',
  'frustrated',
  'bored',
  'disconnected',
  'ghosted',
  'max_turns'
];

// Default emotional state if persona doesn't specify
export const DEFAULT_EMOTIONAL_STATE = {
  questionsAnswered: 0.0,
  feltHeard: 0.5,
  trust: 0.5,
  engagement: 0.7,
  frustration: 0.0,
  connection: 0.5,
  goalProgress: 0.0,
  novelty: 0.6
};

// Default inertia values if persona doesn't specify
export const DEFAULT_INERTIA = {
  positive: 0.4,  // Positive emotions shift more easily
  negative: 0.6   // Negative emotions (frustration) linger
};

// Default reaction weights if persona doesn't specify
export const DEFAULT_REACTION_WEIGHTS = {
  'theyAddressedMyQuestion': { questionsAnswered: 0.15, goalProgress: 0.1 },
  '!theyAddressedMyQuestion': { frustration: 0.1 },
  'theyUnderstoodMe': { feltHeard: 0.12, connection: 0.08 },
  '!theyUnderstoodMe': { feltHeard: -0.1, connection: -0.08 },
  'theyFeltGenuine': { trust: 0.1 },
  '!theyFeltGenuine': { trust: -0.12 },
  'theyDeflected': { frustration: 0.15, trust: -0.05 },
  'theyRepeated': { novelty: -0.2, engagement: -0.1, frustration: 0.1 },
  'thisWasNewInformation': { novelty: 0.1, engagement: 0.08 },
  '!thisWasNewInformation': { novelty: -0.05 },
  '!iWantToContinue': { engagement: -0.2 }
};

// Default decay rates if persona doesn't specify
export const DEFAULT_DECAY_RATES = {
  engagement: -0.03,
  novelty: -0.02
};

// Default exit thresholds if persona doesn't specify
export const DEFAULT_EXIT_THRESHOLDS = {
  satisfied: {
    conditions: { questionsAnswered: 0.7, feltHeard: 0.6, trust: 0.5 },
    probability: 0.35
  },
  frustrated: {
    conditions: { frustration: 0.6 },
    probability: 0.5
  },
  bored: {
    conditions: { engagement: 0.3, novelty: 0.3 },
    probability: 0.4
  },
  disconnected: {
    conditions: { trust: 0.3 },
    probability: 0.5
  },
  ghosted: {
    conditions: { engagement: 0.2 },
    minTurn: 8,
    probability: 0.3
  }
};

// Default exit behavior if persona doesn't specify
export const DEFAULT_EXIT_BEHAVIOR = {
  satisfied: { probability: 0.9 },
  frustrated: { probability: 0.7 },
  bored: { probability: 0.2 },
  disconnected: { probability: 0.5 },
  ghosted: { probability: 0.0 }
};

// ========== STATE MANAGEMENT ==========

/**
 * Initialize emotional state from persona defaults
 * @param {Object} persona - The persona configuration
 * @returns {Object} Initial emotional state with history tracking
 */
export function initEmotionalState(persona) {
  const defaults = persona.emotionalDefaults || DEFAULT_EMOTIONAL_STATE;

  return {
    // The 8 factors
    questionsAnswered: defaults.questionsAnswered ?? 0.0,
    feltHeard: defaults.feltHeard ?? 0.5,
    trust: defaults.trust ?? 0.5,
    engagement: defaults.engagement ?? 0.7,
    frustration: defaults.frustration ?? 0.0,
    connection: defaults.connection ?? 0.5,
    goalProgress: defaults.goalProgress ?? 0.0,
    novelty: defaults.novelty ?? 0.6,

    // Tracking
    mustAnswerCovered: [],
    turnsSincePositive: 0,

    // History for analysis
    stateHistory: []
  };
}

/**
 * Update emotional state based on LLM reaction
 * Applies reaction weights with inertia blending
 *
 * @param {Object} state - Current emotional state
 * @param {Object} reaction - Binary reaction flags from LLM
 * @param {Object} persona - Persona configuration
 * @param {number} turn - Current turn number
 * @returns {Object} New emotional state
 */
export function updateState(state, reaction, persona, turn) {
  const reactionWeights = persona.reactionWeights || DEFAULT_REACTION_WEIGHTS;
  const decayRates = persona.decayRates || DEFAULT_DECAY_RATES;
  const inertia = persona.emotionalInertia || DEFAULT_INERTIA;

  // Step 1: Calculate raw new values from reaction
  const rawDeltas = {};
  for (const factor of FACTORS) {
    rawDeltas[factor] = 0;
  }

  // Apply reaction-based deltas
  for (const [flag, value] of Object.entries(reaction)) {
    if (typeof value !== 'boolean') continue;

    const key = value ? flag : `!${flag}`;
    const weights = reactionWeights[key];

    if (weights) {
      for (const [factor, delta] of Object.entries(weights)) {
        if (rawDeltas[factor] !== undefined) {
          rawDeltas[factor] += delta;
        }
      }
    }
  }

  // Step 2: Apply decay
  for (const [factor, rate] of Object.entries(decayRates)) {
    if (rawDeltas[factor] !== undefined) {
      rawDeltas[factor] += rate;
    }
  }

  // Step 3: Calculate new values with inertia blending
  const newState = { ...state };

  for (const factor of FACTORS) {
    const oldValue = state[factor] || 0;
    const rawNewValue = oldValue + rawDeltas[factor];

    // Apply inertia based on whether factor is positive or negative
    const factorInertia = NEGATIVE_FACTORS.includes(factor)
      ? inertia.negative
      : inertia.positive;

    // Blend: newValue = (oldValue * inertia) + (rawNewValue * (1 - inertia))
    const blendedValue = (oldValue * factorInertia) + (rawNewValue * (1 - factorInertia));

    // Clamp to 0-1
    newState[factor] = Math.max(0, Math.min(1, blendedValue));
  }

  // Track positive engagement
  if (reaction.theyAddressedMyQuestion || reaction.thisWasNewInformation) {
    newState.turnsSincePositive = 0;
  } else {
    newState.turnsSincePositive = (state.turnsSincePositive || 0) + 1;
  }

  // Store history for analysis
  newState.stateHistory = [...(state.stateHistory || []), {
    turn,
    reaction: { ...reaction },
    stateBefore: extractFactors(state),
    stateAfter: extractFactors(newState),
    deltas: rawDeltas
  }];

  // Preserve tracking fields
  newState.mustAnswerCovered = state.mustAnswerCovered || [];

  return newState;
}

/**
 * Extract just the factor values from state (for logging)
 */
function extractFactors(state) {
  const factors = {};
  for (const factor of FACTORS) {
    factors[factor] = state[factor];
  }
  return factors;
}

// ========== TERMINATION LOGIC ==========

/**
 * Calculate exit probabilities based on current state
 *
 * @param {Object} state - Current emotional state
 * @param {Object} persona - Persona configuration
 * @param {number} turn - Current turn number
 * @returns {Object} Probabilities for each exit type
 */
export function calculateExitProbabilities(state, persona, turn) {
  const thresholds = persona.exitThresholds || DEFAULT_EXIT_THRESHOLDS;
  const probs = {};

  // Satisfied exit
  const satisfiedCfg = thresholds.satisfied;
  if (satisfiedCfg) {
    const conditionsMet = Object.entries(satisfiedCfg.conditions || {}).every(
      ([factor, threshold]) => (state[factor] || 0) >= threshold
    );
    if (conditionsMet) {
      probs.satisfied = satisfiedCfg.probability || 0.35;
    }
  }

  // Frustrated exit
  const frustratedCfg = thresholds.frustrated;
  if (frustratedCfg) {
    const conditionsMet = Object.entries(frustratedCfg.conditions || {}).every(
      ([factor, threshold]) => (state[factor] || 0) >= threshold
    );
    if (conditionsMet) {
      probs.frustrated = frustratedCfg.probability || 0.5;
    }
  }

  // Bored exit (conditions are "below" thresholds)
  const boredCfg = thresholds.bored;
  if (boredCfg) {
    const conditionsMet = Object.entries(boredCfg.conditions || {}).every(
      ([factor, threshold]) => (state[factor] || 0) < threshold
    );
    if (conditionsMet) {
      probs.bored = boredCfg.probability || 0.4;
    }
  }

  // Disconnected exit (below threshold)
  const disconnectedCfg = thresholds.disconnected;
  if (disconnectedCfg) {
    const conditionsMet = Object.entries(disconnectedCfg.conditions || {}).every(
      ([factor, threshold]) => (state[factor] || 0) < threshold
    );
    if (conditionsMet) {
      probs.disconnected = disconnectedCfg.probability || 0.5;
    }
  }

  // Ghosted exit
  const ghostedCfg = thresholds.ghosted;
  if (ghostedCfg) {
    const minTurn = ghostedCfg.minTurn || 8;
    const conditionsMet = turn >= minTurn && Object.entries(ghostedCfg.conditions || {}).every(
      ([factor, threshold]) => (state[factor] || 0) < threshold
    );
    if (conditionsMet) {
      probs.ghosted = ghostedCfg.probability || 0.3;
    }
  }

  return probs;
}

/**
 * Determine if persona should exit conversation
 *
 * @param {Object} state - Current emotional state
 * @param {number} turn - Current turn number
 * @param {Object} persona - Persona configuration
 * @returns {Object} Exit decision { exit: bool, reason: string, generateMessage: bool, probability: number }
 */
export function shouldTerminate(state, turn, persona) {
  const { termination } = persona;
  const minTurns = termination?.minTurns || 3;
  const maxTurns = termination?.maxTurns || 25;
  const exitBehavior = persona.exitBehavior || DEFAULT_EXIT_BEHAVIOR;

  // Hard bounds
  if (turn < minTurns) {
    return { exit: false };
  }

  if (turn >= maxTurns) {
    return {
      exit: true,
      reason: 'max_turns',
      generateMessage: false,
      probability: 1.0
    };
  }

  // Calculate probabilities
  const probs = calculateExitProbabilities(state, persona, turn);

  // Roll dice
  const roll = Math.random();
  let cumulative = 0;

  for (const [reason, prob] of Object.entries(probs)) {
    cumulative += prob;
    if (roll < cumulative) {
      // Determine if we generate a message
      const behavior = exitBehavior[reason] || {};
      const msgProb = behavior.probability ?? 0.5;
      const generateMessage = Math.random() < msgProb;

      return {
        exit: true,
        reason,
        generateMessage,
        probability: prob,
        exitProbabilities: probs
      };
    }
  }

  return {
    exit: false,
    exitProbabilities: probs
  };
}

// ========== PROMPT BUILDING ==========

/**
 * Build the LLM prompt for generating persona response
 * Includes emotional state context
 *
 * @param {Object} persona - Persona configuration
 * @param {Array} messages - Conversation history
 * @param {Object} state - Current emotional state
 * @returns {string} Complete prompt for LLM
 */
export function buildPersonaPrompt(persona, messages, state) {
  const emotionalContext = describeEmotionalState(state, persona);

  // Build unanswered questions context
  const unanswered = (persona.objectives?.mustAnswer || []).filter(
    q => !(state.mustAnswerCovered || []).includes(q)
  );

  // Build demographics context if available
  const demographicsContext = persona.demographics
    ? `
=== YOUR BACKGROUND ===
Age: ${persona.demographics.age || 'not specified'}
Location: ${persona.demographics.location || 'not specified'}
Occupation: ${persona.demographics.occupation || 'not specified'}
Life situation: ${persona.demographics.familySituation || 'not specified'}
Living context: ${persona.demographics.livingContext || 'not specified'}
`
    : '';

  // Build values context if available
  const valuesContext = persona.values
    ? `
=== YOUR VALUES ===
What matters most to you: ${(persona.values.ranked || []).join(', ')}
Dealbreakers: ${(persona.values.dealbreakers || []).join(', ')}
`
    : '';

  return `You are ${persona.name}, a real person having a conversation about a community/living situation.

${demographicsContext}
${valuesContext}

=== YOUR PERSONALITY ===
${persona.conversationStyle?.promptGuidance || 'Be natural and authentic.'}

=== YOUR CURRENT EMOTIONAL STATE ===
${emotionalContext}

=== CONVERSATION SO FAR ===
${messages.map(m => `${m.role === 'user' ? 'You' : 'Guide'}: ${m.content}`).join('\n')}

=== YOUR UNANSWERED QUESTIONS ===
${unanswered.length > 0 ? unanswered.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Most have been addressed.'}

=== YOUR TASK ===
Generate your next message AND your honest reaction to what the Guide just said.

You MUST respond with valid JSON in this exact format:
{
  "message": "Your next message as ${persona.name}",
  "reaction": {
    "theyAddressedMyQuestion": true or false,
    "theyUnderstoodMe": true or false,
    "theyFeltGenuine": true or false,
    "theyDeflected": true or false,
    "theyRepeated": true or false,
    "iWantToContinue": true or false,
    "thisWasNewInformation": true or false
  }
}

IMPORTANT: Output ONLY the JSON object, no additional text.`;
}

/**
 * Convert numeric emotional state to natural language for LLM
 *
 * @param {Object} state - Current emotional state
 * @param {Object} persona - Persona configuration (unused currently, for future customization)
 * @returns {string} Natural language description
 */
export function describeEmotionalState(state, persona) {
  const lines = [];

  // Satisfaction level
  if (state.questionsAnswered > 0.7) {
    lines.push("You feel like your questions are being addressed well.");
  } else if (state.questionsAnswered < 0.3) {
    lines.push("You feel like your main questions haven't been answered yet.");
  }

  // Felt heard
  if (state.feltHeard > 0.7) {
    lines.push("You feel understood and heard.");
  } else if (state.feltHeard < 0.3) {
    lines.push("You feel like they're not really getting what you're saying.");
  }

  // Trust
  if (state.trust > 0.7) {
    lines.push("This feels genuine and authentic to you.");
  } else if (state.trust < 0.3) {
    lines.push("Something feels off - this doesn't feel entirely genuine.");
  }

  // Engagement
  if (state.engagement < 0.3) {
    lines.push("You're losing interest. Your responses might be shorter, more pointed.");
  } else if (state.engagement > 0.7) {
    lines.push("You're engaged and want to explore deeper.");
  }

  // Frustration
  if (state.frustration > 0.6) {
    lines.push("You're getting frustrated. You might be more direct or even curt.");
  } else if (state.frustration > 0.4) {
    lines.push("You're feeling some frustration building.");
  }

  // Connection
  if (state.connection > 0.7) {
    lines.push("You feel a real connection forming.");
  } else if (state.connection < 0.3) {
    lines.push("You don't feel much connection with this person.");
  }

  // Novelty
  if (state.novelty < 0.3) {
    lines.push("This conversation feels repetitive - nothing new is being said.");
  }

  return lines.length > 0 ? lines.join('\n') : "You're in a neutral, evaluating state - open but still figuring things out.";
}

/**
 * Build prompt for generating exit message
 *
 * @param {Object} persona - Persona configuration
 * @param {Object} state - Current emotional state
 * @param {string} exitReason - Why persona is leaving
 * @param {Array} messages - Conversation history
 * @returns {string} Prompt for generating exit message
 */
export function buildExitMessagePrompt(persona, state, exitReason, messages) {
  const exitDescriptions = {
    satisfied: "You've had a good conversation and feel you understand enough to think about next steps. You're leaving on a positive note.",
    frustrated: "You're frustrated because your core questions weren't addressed despite trying. You're ending the conversation.",
    bored: "You've lost interest - the conversation isn't going anywhere meaningful.",
    disconnected: "Something felt off about this conversation - inauthentic or misaligned. You're stepping away.",
    ghosted: null // No message for ghosting
  };

  const description = exitDescriptions[exitReason];
  if (!description) return null;

  return `You are ${persona.name}. You've been having a conversation and now you're leaving.

WHY YOU'RE LEAVING:
${description}

YOUR EMOTIONAL STATE:
- Trust: ${(state.trust * 100).toFixed(0)}%
- Frustration: ${(state.frustration * 100).toFixed(0)}%
- Engagement: ${(state.engagement * 100).toFixed(0)}%

RECENT CONVERSATION:
${messages.slice(-4).map(m => `${m.role === 'user' ? 'You' : 'Guide'}: ${m.content}`).join('\n')}

Generate a brief, natural closing message (1-3 sentences). Be authentic to your character and emotional state.

Output ONLY the message text, no JSON or metadata.`;
}

// ========== RESPONSE PARSING ==========

/**
 * Parse LLM response into message and reaction
 * Returns null if parsing fails
 *
 * @param {string} llmOutput - Raw LLM output
 * @returns {Object|null} Parsed { message, reaction } or null
 */
export function parsePersonaResponse(llmOutput) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.message || typeof parsed.message !== 'string') {
      return null;
    }

    if (!parsed.reaction || typeof parsed.reaction !== 'object') {
      return null;
    }

    // Validate reaction has boolean values
    const requiredReactions = [
      'theyAddressedMyQuestion',
      'theyUnderstoodMe',
      'theyFeltGenuine',
      'theyDeflected',
      'theyRepeated',
      'iWantToContinue',
      'thisWasNewInformation'
    ];

    for (const key of requiredReactions) {
      if (typeof parsed.reaction[key] !== 'boolean') {
        // Default missing reactions to neutral
        parsed.reaction[key] = key === 'iWantToContinue' ? true : false;
      }
    }

    return {
      message: parsed.message.trim(),
      reaction: parsed.reaction
    };
  } catch (error) {
    return null;
  }
}

// ========== LOGGING ==========

/**
 * Generate structured log for a completed run
 *
 * @param {Object} result - Run result data
 * @returns {Object} Structured log object
 */
export function generateRunLog(result) {
  return {
    personaId: result.personaId,
    personaName: result.personaName,
    runNumber: result.runNumber,
    sessionId: result.sessionId,

    // Outcome
    exitReason: result.exitReason,
    exitProbability: result.exitProbability,
    turnCount: result.turnCount,

    // Final state
    finalState: result.finalState ? extractFactors(result.finalState) : null,

    // Full history
    stateHistory: result.finalState?.stateHistory || [],

    // Metadata
    timestamp: result.timestamp || new Date().toISOString()
  };
}

/**
 * Print validation report for a set of runs
 *
 * @param {Array} allResults - Array of run results
 */
export function printValidationReport(allResults) {
  const total = allResults.length;
  if (total === 0) {
    console.log('\nNo results to report.');
    return;
  }

  console.log('\n' + '='.repeat(70));
  console.log('VALIDATION REPORT');
  console.log('='.repeat(70));

  // 1. Turn count distribution
  const turnBuckets = { '1-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '21-25': 0 };
  for (const r of allResults) {
    const tc = r.turnCount || 0;
    if (tc <= 5) turnBuckets['1-5']++;
    else if (tc <= 10) turnBuckets['6-10']++;
    else if (tc <= 15) turnBuckets['11-15']++;
    else if (tc <= 20) turnBuckets['16-20']++;
    else turnBuckets['21-25']++;
  }

  console.log('\nTurn Count Distribution:');
  for (const [bucket, count] of Object.entries(turnBuckets)) {
    const pct = ((count / total) * 100).toFixed(1);
    const bar = '#'.repeat(Math.round(count / total * 30));
    console.log(`  ${bucket.padEnd(6)} ${bar.padEnd(30)} ${pct}% (${count})`);
  }

  // 2. Exit reason distribution
  const exitReasons = {};
  for (const r of allResults) {
    const reason = r.exitReason || 'unknown';
    exitReasons[reason] = (exitReasons[reason] || 0) + 1;
  }

  console.log('\nExit Reason Distribution:');
  for (const [reason, count] of Object.entries(exitReasons).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    const bar = '#'.repeat(Math.round(count / total * 30));
    console.log(`  ${reason.padEnd(12)} ${bar.padEnd(30)} ${pct}% (${count})`);
  }

  // 3. Average final states
  console.log('\nAverage Final State Values:');
  const avgState = {};
  for (const factor of FACTORS) {
    const values = allResults
      .filter(r => r.finalState && r.finalState[factor] !== undefined)
      .map(r => r.finalState[factor]);
    if (values.length > 0) {
      avgState[factor] = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
    }
  }
  for (const [factor, avg] of Object.entries(avgState)) {
    console.log(`  ${factor.padEnd(20)} ${avg}`);
  }

  // 4. Summary stats
  console.log('\n' + '-'.repeat(70));
  console.log('SUMMARY:');
  const avgTurns = allResults.reduce((a, r) => a + (r.turnCount || 0), 0) / total;
  const maxTurnsExits = (exitReasons['max_turns'] || 0) / total * 100;
  console.log(`  Total runs: ${total}`);
  console.log(`  Average turns: ${avgTurns.toFixed(1)}`);
  console.log(`  Max turns exits: ${maxTurnsExits.toFixed(1)}% (target: <20%)`);
}
