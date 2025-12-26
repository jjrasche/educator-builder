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

// Required reaction keys that personas must define weights for
export const REQUIRED_REACTION_KEYS = [
  'theyAddressedMyQuestion',
  '!theyAddressedMyQuestion',
  'theyUnderstoodMe',
  '!theyUnderstoodMe',
  'theyFeltGenuine',
  '!theyFeltGenuine',
  'theyDeflected',
  'theyRepeated',
  'thisWasNewInformation',
  '!thisWasNewInformation',
  '!iWantToContinue'
];

// ========== STRICT VALIDATION ==========

/**
 * Validate that a persona has all required fields for the engine.
 * Throws an error if any required field is missing.
 *
 * @param {Object} persona - The persona configuration
 * @throws {Error} If any required field is missing
 */
export function validatePersona(persona) {
  const errors = [];
  const personaId = persona.id || 'unknown';

  // Required top-level fields
  if (!persona.emotionalDefaults) {
    errors.push('emotionalDefaults is required');
  } else {
    for (const factor of FACTORS) {
      if (typeof persona.emotionalDefaults[factor] !== 'number') {
        errors.push(`emotionalDefaults.${factor} must be a number`);
      }
    }
  }

  if (!persona.emotionalInertia) {
    errors.push('emotionalInertia is required');
  } else {
    if (typeof persona.emotionalInertia.positive !== 'number') {
      errors.push('emotionalInertia.positive must be a number');
    }
    if (typeof persona.emotionalInertia.negative !== 'number') {
      errors.push('emotionalInertia.negative must be a number');
    }
  }

  if (!persona.reactionWeights) {
    errors.push('reactionWeights is required');
  } else {
    for (const key of REQUIRED_REACTION_KEYS) {
      if (!persona.reactionWeights[key]) {
        errors.push(`reactionWeights["${key}"] is required`);
      }
    }
  }

  if (!persona.decayRates) {
    errors.push('decayRates is required');
  } else {
    if (typeof persona.decayRates.engagement !== 'number') {
      errors.push('decayRates.engagement must be a number');
    }
    if (typeof persona.decayRates.novelty !== 'number') {
      errors.push('decayRates.novelty must be a number');
    }
  }

  if (!persona.exitThresholds) {
    errors.push('exitThresholds is required');
  } else {
    const requiredExitTypes = ['satisfied', 'frustrated', 'bored', 'disconnected', 'ghosted'];
    for (const exitType of requiredExitTypes) {
      if (!persona.exitThresholds[exitType]) {
        errors.push(`exitThresholds.${exitType} is required`);
      } else {
        if (!persona.exitThresholds[exitType].conditions) {
          errors.push(`exitThresholds.${exitType}.conditions is required`);
        }
        if (typeof persona.exitThresholds[exitType].probability !== 'number') {
          errors.push(`exitThresholds.${exitType}.probability must be a number`);
        }
        // ghosted requires minTurn
        if (exitType === 'ghosted' && typeof persona.exitThresholds[exitType].minTurn !== 'number') {
          errors.push('exitThresholds.ghosted.minTurn must be a number');
        }
      }
    }
  }

  if (!persona.exitBehavior) {
    errors.push('exitBehavior is required');
  } else {
    const requiredExitBehaviors = ['satisfied', 'frustrated', 'bored', 'disconnected', 'ghosted'];
    for (const exitType of requiredExitBehaviors) {
      if (!persona.exitBehavior[exitType]) {
        errors.push(`exitBehavior.${exitType} is required`);
      } else if (typeof persona.exitBehavior[exitType].probability !== 'number') {
        errors.push(`exitBehavior.${exitType}.probability must be a number`);
      }
    }
  }

  if (!persona.termination) {
    errors.push('termination is required');
  } else {
    if (typeof persona.termination.minTurns !== 'number') {
      errors.push('termination.minTurns must be a number');
    }
    if (typeof persona.termination.maxTurns !== 'number') {
      errors.push('termination.maxTurns must be a number');
    }
  }

  if (!persona.conversationStyle?.promptGuidance) {
    errors.push('conversationStyle.promptGuidance is required');
  }

  if (!persona.objectives?.mustAnswer || persona.objectives.mustAnswer.length === 0) {
    errors.push('objectives.mustAnswer is required and must have at least one item');
  }

  if (!persona.opening?.firstMessage) {
    errors.push('opening.firstMessage is required');
  }

  // Demographics - required for rich persona context
  if (!persona.demographics) {
    errors.push('demographics is required');
  } else {
    const requiredDemographics = ['age', 'location', 'occupation', 'familySituation', 'livingContext'];
    for (const field of requiredDemographics) {
      if (persona.demographics[field] === undefined || persona.demographics[field] === null) {
        errors.push(`demographics.${field} is required`);
      }
    }
  }

  // Values - required for decision-making context
  if (!persona.values) {
    errors.push('values is required');
  } else {
    if (!Array.isArray(persona.values.ranked) || persona.values.ranked.length === 0) {
      errors.push('values.ranked must be a non-empty array');
    }
    if (!Array.isArray(persona.values.dealbreakers) || persona.values.dealbreakers.length === 0) {
      errors.push('values.dealbreakers must be a non-empty array');
    }
  }

  // Behavioral - required for communication style
  if (!persona.behavioral) {
    errors.push('behavioral is required');
  } else {
    const requiredBehavioral = ['communicationStyle', 'reasoningStyle', 'authenticityLevel', 'questioningDepth'];
    for (const field of requiredBehavioral) {
      if (persona.behavioral[field] === undefined || persona.behavioral[field] === null) {
        errors.push(`behavioral.${field} is required`);
      }
    }
  }

  // Constraints - required for limits
  if (!persona.constraints) {
    errors.push('constraints is required');
  } else {
    if (!Array.isArray(persona.constraints.avoidancePatterns)) {
      errors.push('constraints.avoidancePatterns must be an array');
    }
    if (!Array.isArray(persona.constraints.conversationalLimits)) {
      errors.push('constraints.conversationalLimits must be an array');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Persona "${personaId}" validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

// ========== STATE MANAGEMENT ==========

/**
 * Initialize emotional state from persona defaults.
 * STRICT MODE: Throws if persona lacks required emotionalDefaults.
 *
 * @param {Object} persona - The persona configuration
 * @returns {Object} Initial emotional state with history tracking
 * @throws {Error} If emotionalDefaults is missing or incomplete
 */
export function initEmotionalState(persona) {
  // Validate persona first (will throw if incomplete)
  validatePersona(persona);

  const defaults = persona.emotionalDefaults;

  return {
    // The 8 factors - all required, no fallbacks
    questionsAnswered: defaults.questionsAnswered,
    feltHeard: defaults.feltHeard,
    trust: defaults.trust,
    engagement: defaults.engagement,
    frustration: defaults.frustration,
    connection: defaults.connection,
    goalProgress: defaults.goalProgress,
    novelty: defaults.novelty,

    // Tracking
    mustAnswerCovered: [],
    turnsSincePositive: 0,

    // History for analysis
    stateHistory: []
  };
}

/**
 * Update emotional state based on LLM reaction.
 * Applies reaction weights with inertia blending.
 * STRICT MODE: Requires all persona fields, no fallbacks.
 *
 * @param {Object} state - Current emotional state
 * @param {Object} reaction - Binary reaction flags from LLM
 * @param {Object} persona - Persona configuration
 * @param {number} turn - Current turn number
 * @returns {Object} New emotional state
 */
export function updateState(state, reaction, persona, turn) {
  // No fallbacks - persona must have these fields (validated at init)
  const reactionWeights = persona.reactionWeights;
  const decayRates = persona.decayRates;
  const inertia = persona.emotionalInertia;

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
 * Calculate exit probabilities based on current state.
 * STRICT MODE: Requires all persona exit thresholds, no fallbacks.
 *
 * @param {Object} state - Current emotional state
 * @param {Object} persona - Persona configuration
 * @param {number} turn - Current turn number
 * @returns {Object} Probabilities for each exit type
 */
export function calculateExitProbabilities(state, persona, turn) {
  // No fallbacks - persona must have exitThresholds (validated at init)
  const thresholds = persona.exitThresholds;
  const probs = {};

  // Satisfied exit - conditions must be met (all >= threshold)
  const satisfiedCfg = thresholds.satisfied;
  const satisfiedMet = Object.entries(satisfiedCfg.conditions).every(
    ([factor, threshold]) => state[factor] >= threshold
  );
  if (satisfiedMet) {
    probs.satisfied = satisfiedCfg.probability;
  }

  // Frustrated exit - conditions must be met (all >= threshold)
  const frustratedCfg = thresholds.frustrated;
  const frustratedMet = Object.entries(frustratedCfg.conditions).every(
    ([factor, threshold]) => state[factor] >= threshold
  );
  if (frustratedMet) {
    probs.frustrated = frustratedCfg.probability;
  }

  // Bored exit - conditions are "below" thresholds (all < threshold)
  const boredCfg = thresholds.bored;
  const boredMet = Object.entries(boredCfg.conditions).every(
    ([factor, threshold]) => state[factor] < threshold
  );
  if (boredMet) {
    probs.bored = boredCfg.probability;
  }

  // Disconnected exit - below threshold (all < threshold)
  const disconnectedCfg = thresholds.disconnected;
  const disconnectedMet = Object.entries(disconnectedCfg.conditions).every(
    ([factor, threshold]) => state[factor] < threshold
  );
  if (disconnectedMet) {
    probs.disconnected = disconnectedCfg.probability;
  }

  // Ghosted exit - below threshold AND past minTurn
  const ghostedCfg = thresholds.ghosted;
  const ghostedMinTurn = ghostedCfg.minTurn;
  const ghostedMet = turn >= ghostedMinTurn && Object.entries(ghostedCfg.conditions).every(
    ([factor, threshold]) => state[factor] < threshold
  );
  if (ghostedMet) {
    probs.ghosted = ghostedCfg.probability;
  }

  return probs;
}

/**
 * Determine if persona should exit conversation.
 * STRICT MODE: Requires all persona termination fields, no fallbacks.
 *
 * @param {Object} state - Current emotional state
 * @param {number} turn - Current turn number
 * @param {Object} persona - Persona configuration
 * @returns {Object} Exit decision { exit: bool, reason: string, generateMessage: bool, probability: number }
 */
export function shouldTerminate(state, turn, persona) {
  // No fallbacks - persona must have these fields (validated at init)
  const minTurns = persona.termination.minTurns;
  const maxTurns = persona.termination.maxTurns;
  const exitBehavior = persona.exitBehavior;

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
      // Determine if we generate a message - no fallbacks
      const behavior = exitBehavior[reason];
      const msgProb = behavior.probability;
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

  // Build unanswered questions context - no fallbacks
  const unanswered = persona.objectives.mustAnswer.filter(
    q => !(state.mustAnswerCovered || []).includes(q)
  );

  // Build demographics context - all fields required (validated at init)
  const demographicsContext = `
=== YOUR BACKGROUND ===
Age: ${persona.demographics.age}
Location: ${persona.demographics.location}
Occupation: ${persona.demographics.occupation}
Life situation: ${persona.demographics.familySituation}
Living context: ${persona.demographics.livingContext}
`;

  // Build values context - required (validated at init)
  const valuesContext = `
=== YOUR VALUES ===
What matters most to you: ${persona.values.ranked.join(', ')}
Dealbreakers: ${persona.values.dealbreakers.join(', ')}
`;

  // Build behavioral context - translating structured data to natural language
  // Research shows natural language works better for reasoning/roleplay
  const behavioralContext = `
=== HOW YOU COMMUNICATE ===
Communication style: ${describeCommunicationStyle(persona.behavioral.communicationStyle)}
Reasoning approach: ${describeReasoningStyle(persona.behavioral.reasoningStyle)}
Question depth: ${describeQuestioningDepth(persona.behavioral.questioningDepth)}
${persona.behavioral.responsePatterns?.length > 0 ? `Your patterns: ${persona.behavioral.responsePatterns.join('; ')}` : ''}
`;

  // Build constraints context - required (validated at init)
  const constraintsContext = `
=== YOUR LIMITS ===
${persona.constraints.avoidancePatterns.length > 0 ? `You avoid: ${persona.constraints.avoidancePatterns.join('; ')}` : ''}
${persona.constraints.conversationalLimits.length > 0 ? `Conversation style: ${persona.constraints.conversationalLimits.join('; ')}` : ''}
`;

  return `You are ${persona.name}, a real person having a conversation about a community/living situation.

${demographicsContext}
${valuesContext}
${behavioralContext}
${constraintsContext}

=== YOUR PERSONALITY ===
${persona.conversationStyle.promptGuidance}

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
 * Convert communicationStyle enum to natural language
 */
function describeCommunicationStyle(style) {
  const descriptions = {
    'articulate': 'You express yourself clearly and precisely',
    'exploratory': 'You think out loud and explore ideas as you talk',
    'transactional': 'You keep things brief and to the point',
    'vague': 'You sometimes struggle to express exactly what you mean',
    'performative': 'You tend to present a polished version of yourself'
  };
  return descriptions[style] || style;
}

/**
 * Convert reasoningStyle enum to natural language
 */
function describeReasoningStyle(style) {
  const descriptions = {
    'philosophical': 'You think about deeper meaning and principles',
    'practical': 'You focus on what actually works in real life',
    'systems-oriented': 'You think about how things connect and interact',
    'surface-level': 'You focus on immediate, concrete concerns'
  };
  return descriptions[style] || style;
}

/**
 * Convert questioningDepth enum to natural language
 */
function describeQuestioningDepth(depth) {
  const descriptions = {
    'deep-philosophical': 'You ask probing questions about meaning and purpose',
    'curious-practical': 'You ask practical questions to understand how things work',
    'logistics-only': 'You mainly ask about practical details and logistics',
    'none': 'You rarely ask questions'
  };
  return descriptions[depth] || depth;
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
