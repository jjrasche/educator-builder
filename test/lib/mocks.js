// External Dependency Mocks ONLY
// - Groq API (chat completions)
// - OpenAI/Groq Whisper (transcription)
// - Vercel KV (storage)
// All internal logic runs for real. These mocks make tests deterministic and cost-free.

// ============================================================================
// MOCK GROQ CHAT RESPONSES
// ============================================================================

const MOCK_CHAT_RESPONSES = {
  // First message - opening question
  initial: {
    response: "What draws you to this kind of work? Not the logistics—the actual thing. What's the itch you're trying to scratch?",
    metadata: {
      speechAct: "directive",
      dialogueAct: "open_with_question",
      criteria: ["philosophical curiosity", "self-awareness"],
      rubricScores: {
        "depth-of-questioning": 5,
        "self-awareness": 5,
        "systems-thinking": 5,
        "experimentation-evidence": 5,
        "communication-clarity": 5,
        "commitment-signals": 5,
        "value-alignment": 5,
        "resilience-indicators": 5
      },
      fitScore: 50,
      allFloorsPass: true,
      rationale: "Opening question to gauge genuine interest",
      canUnlockEmail: false
    }
  },

  // Response to genuine curiosity
  engaged: {
    response: "That resonates. When you say you want to build things that matter—what does 'matter' mean to you? Is it impact, craft, community, or something else?",
    metadata: {
      speechAct: "directive",
      dialogueAct: "probe_deeper",
      criteria: ["philosophical curiosity", "value alignment"],
      rubricScores: {
        "depth-of-questioning": 7,
        "self-awareness": 6,
        "systems-thinking": 6,
        "experimentation-evidence": 5,
        "communication-clarity": 7,
        "commitment-signals": 6,
        "value-alignment": 7,
        "resilience-indicators": 6
      },
      fitScore: 65,
      allFloorsPass: true,
      rationale: "User showing genuine engagement, probing deeper",
      canUnlockEmail: false
    }
  },

  // Response to shallow/logistical questions
  shallow: {
    response: "Let's step back from the logistics for a second. What's actually motivating you to consider this? What would be different in your life if this worked out?",
    metadata: {
      speechAct: "directive",
      dialogueAct: "redirect_from_surface",
      criteria: ["depth of questioning"],
      rubricScores: {
        "depth-of-questioning": 3,
        "self-awareness": 4,
        "systems-thinking": 4,
        "experimentation-evidence": 4,
        "communication-clarity": 5,
        "commitment-signals": 3,
        "value-alignment": 4,
        "resilience-indicators": 4
      },
      fitScore: 35,
      allFloorsPass: false,
      rationale: "User focusing on surface questions, redirecting to depth",
      canUnlockEmail: false
    }
  },

  // High engagement response
  highFit: {
    response: "I hear real clarity in what you're saying. You're not just looking for a job—you're looking for a context where you can do meaningful work alongside people who care. That's exactly what this is. What questions do you have about how we actually work together?",
    metadata: {
      speechAct: "expressive",
      dialogueAct: "affirm_commitment",
      criteria: ["commitment signals", "value alignment", "authenticity"],
      rubricScores: {
        "depth-of-questioning": 8,
        "self-awareness": 8,
        "systems-thinking": 7,
        "experimentation-evidence": 7,
        "communication-clarity": 8,
        "commitment-signals": 8,
        "value-alignment": 9,
        "resilience-indicators": 7
      },
      fitScore: 82,
      allFloorsPass: true,
      rationale: "User showing strong alignment and genuine commitment",
      canUnlockEmail: true
    }
  }
};

// Select mock response based on message content
export function getMockChatResponse(messages) {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
  const turnCount = messages.filter(m => m.role === 'user').length;

  // First turn
  if (turnCount <= 1) {
    return MOCK_CHAT_RESPONSES.initial;
  }

  // Detect shallow/logistical questions
  const shallowKeywords = ['how much', 'salary', 'pay', 'hours', 'location', 'remote', 'benefits'];
  if (shallowKeywords.some(kw => lastMessage.includes(kw))) {
    return MOCK_CHAT_RESPONSES.shallow;
  }

  // Detect high engagement
  const engagedKeywords = ['meaning', 'purpose', 'values', 'community', 'craft', 'build', 'create', 'impact'];
  const commitmentKeywords = ['ready', 'excited', 'want to', 'looking for', 'need', 'believe'];

  if (engagedKeywords.some(kw => lastMessage.includes(kw)) &&
      commitmentKeywords.some(kw => lastMessage.includes(kw))) {
    return MOCK_CHAT_RESPONSES.highFit;
  }

  // Default: engaged response
  return MOCK_CHAT_RESPONSES.engaged;
}

// ============================================================================
// MOCK WHISPER TRANSCRIPTION
// ============================================================================

const MOCK_TRANSCRIPTIONS = {
  // Confident speech
  confident: {
    text: "I've been thinking about this a lot. I want to build things that matter, with people who care about craft. I'm not looking for just any job—I want to be part of something real.",
    duration: 8.5,
    words: [
      { word: "I've", start: 0.0, end: 0.2 },
      { word: "been", start: 0.25, end: 0.4 },
      { word: "thinking", start: 0.45, end: 0.8 },
      { word: "about", start: 0.85, end: 1.0 },
      { word: "this", start: 1.05, end: 1.2 },
      { word: "a", start: 1.25, end: 1.3 },
      { word: "lot.", start: 1.35, end: 1.6 },
      { word: "I", start: 1.9, end: 2.0 },
      { word: "want", start: 2.05, end: 2.2 },
      { word: "to", start: 2.25, end: 2.3 },
      { word: "build", start: 2.35, end: 2.6 },
      { word: "things", start: 2.65, end: 2.9 },
      { word: "that", start: 2.95, end: 3.1 },
      { word: "matter,", start: 3.15, end: 3.5 },
      { word: "with", start: 3.6, end: 3.75 },
      { word: "people", start: 3.8, end: 4.1 },
      { word: "who", start: 4.15, end: 4.3 },
      { word: "care", start: 4.35, end: 4.6 },
      { word: "about", start: 4.65, end: 4.85 },
      { word: "craft.", start: 4.9, end: 5.3 },
      { word: "I'm", start: 5.6, end: 5.75 },
      { word: "not", start: 5.8, end: 5.95 },
      { word: "looking", start: 6.0, end: 6.3 },
      { word: "for", start: 6.35, end: 6.5 },
      { word: "just", start: 6.55, end: 6.75 },
      { word: "any", start: 6.8, end: 6.95 },
      { word: "job—I", start: 7.0, end: 7.3 },
      { word: "want", start: 7.35, end: 7.5 },
      { word: "to", start: 7.55, end: 7.65 },
      { word: "be", start: 7.7, end: 7.8 },
      { word: "part", start: 7.85, end: 8.0 },
      { word: "of", start: 8.05, end: 8.15 },
      { word: "something", start: 8.2, end: 8.4 },
      { word: "real.", start: 8.45, end: 8.7 }
    ]
  },

  // Hesitant speech
  hesitant: {
    text: "Um, so I'm really interested in this, but like, I'm not sure how to explain it well. I feel like I'd learn a lot but I'm nervous about not being, um, smart enough or something. Is that okay?",
    duration: 15.5,
    words: [
      { word: "Um,", start: 0.0, end: 0.3 },
      { word: "so", start: 0.8, end: 0.9 },
      { word: "I'm", start: 0.95, end: 1.1 },
      { word: "really", start: 1.15, end: 1.4 },
      { word: "interested", start: 1.45, end: 1.9 },
      { word: "in", start: 1.95, end: 2.0 },
      { word: "this,", start: 2.05, end: 2.3 },
      { word: "but", start: 2.8, end: 2.9 },
      { word: "like,", start: 3.0, end: 3.2 },
      { word: "I'm", start: 3.4, end: 3.5 },
      { word: "not", start: 3.55, end: 3.7 },
      { word: "sure", start: 3.75, end: 3.95 },
      { word: "how", start: 4.0, end: 4.1 },
      { word: "to", start: 4.15, end: 4.2 },
      { word: "explain", start: 4.25, end: 4.6 },
      { word: "it", start: 4.65, end: 4.75 },
      { word: "well.", start: 4.8, end: 5.1 },
      { word: "I", start: 5.8, end: 5.85 },
      { word: "feel", start: 5.9, end: 6.1 },
      { word: "like", start: 6.15, end: 6.3 },
      { word: "I'd", start: 6.35, end: 6.5 },
      { word: "learn", start: 6.55, end: 6.8 },
      { word: "a", start: 6.85, end: 6.9 },
      { word: "lot", start: 6.95, end: 7.15 },
      { word: "but", start: 7.5, end: 7.6 },
      { word: "I'm", start: 7.65, end: 7.8 },
      { word: "nervous", start: 7.85, end: 8.2 },
      { word: "about", start: 8.25, end: 8.5 },
      { word: "not", start: 8.55, end: 8.7 },
      { word: "being,", start: 8.75, end: 9.0 },
      { word: "um,", start: 9.5, end: 9.7 },
      { word: "smart", start: 9.9, end: 10.2 },
      { word: "enough", start: 10.25, end: 10.5 },
      { word: "or", start: 10.55, end: 10.65 },
      { word: "something.", start: 10.7, end: 11.1 },
      { word: "Is", start: 11.8, end: 11.9 },
      { word: "that", start: 11.95, end: 12.1 },
      { word: "okay?", start: 12.15, end: 12.5 }
    ]
  },

  // Short response
  short: {
    text: "Yes, that sounds interesting.",
    duration: 2.0,
    words: [
      { word: "Yes,", start: 0.0, end: 0.3 },
      { word: "that", start: 0.4, end: 0.6 },
      { word: "sounds", start: 0.7, end: 1.0 },
      { word: "interesting.", start: 1.1, end: 1.8 }
    ]
  }
};

// Select mock transcription based on test scenario
export function getMockTranscription(scenario = 'confident') {
  return MOCK_TRANSCRIPTIONS[scenario] || MOCK_TRANSCRIPTIONS.confident;
}

// ============================================================================
// MOCK CREATIVE INTERPRETATION
// ============================================================================

const MOCK_INTERPRETATIONS = {
  high: "You sound clear and confident—your thoughts are flowing well.",
  moderate: "You're thinking through this carefully. Take your time.",
  low: "I can hear you're processing something. That's okay—speak your mind."
};

export function getMockInterpretation(confidence) {
  return MOCK_INTERPRETATIONS[confidence] || MOCK_INTERPRETATIONS.moderate;
}

// ============================================================================
// TEST KV STORE (Persistent within test run)
// ============================================================================

// Global test store - persists across function calls within same process
const testStore = new Map();

export const testKV = {
  get: async (key) => {
    return testStore.get(key) || null;
  },

  set: async (key, value) => {
    testStore.set(key, value);
  },

  delete: async (key) => {
    testStore.delete(key);
  },

  clear: () => {
    testStore.clear();
  },

  // For inspection
  getAll: () => {
    return Object.fromEntries(testStore);
  },

  keys: () => {
    return Array.from(testStore.keys());
  }
};

// ============================================================================
// ENVIRONMENT SETUP
// ============================================================================

export function setupTestEnvironment() {
  process.env.MOCK_MODE = 'true';
  process.env.TEST_MODE = 'true';
  testKV.clear();
  console.log('[TEST] Environment initialized with MOCK_MODE=true');
}

export function teardownTestEnvironment() {
  delete process.env.MOCK_MODE;
  delete process.env.TEST_MODE;
  testKV.clear();
  console.log('[TEST] Environment cleaned up');
}
