# Proposal: Realistic Synthetic Conversation Schema

## Problem
Current personas have pre-scripted utterances (3 turns). Conversations always end when the script runs out, not when it would naturally end.

## Solution
Add schema fields that let an LLM playing the persona:
1. Generate contextual responses (not pre-scripted)
2. Decide when to end the conversation
3. React to what the AI guide actually says

## Proposed Schema Additions

### 1. Termination Conditions
```json
"termination": {
  "minTurns": 4,
  "maxTurns": 30,

  "positiveExit": {
    "triggers": [
      "fitScore >= 70 for 2+ consecutive turns",
      "stance.orientation >= 3 AND stance.certainty >= 3",
      "All primary questions answered"
    ],
    "behavior": "Express genuine interest, ask about next steps"
  },

  "negativeExit": {
    "triggers": [
      "fitScore < 40 after turn 5",
      "stance.orientation stuck at 1 for 4+ turns",
      "Core values feel misunderstood after 3 attempts to clarify"
    ],
    "behavior": "Politely decline, explain the mismatch"
  },

  "neutralExit": {
    "triggers": [
      "turnCount > 15 without clear resolution",
      "Mixed signals - some alignment, some concerns"
    ],
    "behavior": "Thank the guide, say I need time to reflect"
  }
}
```

### 2. Conversation Goals (Replaces conversationGoal string)
```json
"objectives": {
  "primary": "Determine if this community aligns with my values around autonomy",
  "mustAnswer": [
    "How does personal autonomy work within the community structure?",
    "What happens if someone wants to leave?",
    "How are conflicts resolved?"
  ],
  "niceToAnswer": [
    "What does a typical day look like?",
    "Who else is there currently?"
  ],
  "satisfactionSignals": [
    "Guide demonstrates understanding of my specific concerns",
    "Concrete examples rather than abstract philosophy",
    "Genuine two-way dialogue, not a sales pitch"
  ],
  "dissatisfactionSignals": [
    "Generic responses that don't address my situation",
    "Pressure to commit without answering questions",
    "Dismissing my concerns about autonomy"
  ]
}
```

### 3. Response Strategy (How to react to AI behavior)
```json
"responseStrategy": {
  "toDialogueActs": {
    "probe_deeper": "Engage enthusiastically, share more depth",
    "ask_for_concrete": "Provide specific examples from my experience",
    "redirect_from_surface": "Acknowledge and go deeper if genuine, push back if not",
    "validate_genuine": "Feel understood, consider moving toward commitment",
    "affirm_commitment": "If ready, reciprocate; if not, explain hesitation"
  },

  "toStanceChanges": {
    "orientationIncreased": "Show more openness, ask forward-looking questions",
    "orientationStagnant": "Try a different angle, may express mild frustration",
    "agencyIncreased": "Take more initiative in directing the conversation"
  },

  "toMisunderstanding": "Gently correct, restate my actual position clearly",

  "toGenericResponse": "Push for specifics, express that I need more concrete answers"
}
```

### 4. Starting Context (Replaces sampleUtterances for opening)
```json
"opening": {
  "context": "Found this through a job board, intrigued but skeptical",
  "firstMessage": "Hi—I saw your posting and I'm curious. Can you tell me more about what you're building?",
  "initialMood": "curious but guarded",
  "backstory": "Has tried intentional communities before with mixed results. Values autonomy highly. Currently working remote but feeling isolated."
}
```

### 5. Behavioral Modifiers
```json
"conversationBehavior": {
  "pacing": "thoughtful",  // quick | thoughtful | slow
  "questionsPerTurn": "1-2",
  "sharesPersonalInfo": "when relevant to point",
  "respondsToPressure": "pushes back gently",
  "whenConfused": "asks for clarification",
  "whenExcited": "elaborates, asks follow-ups",
  "whenDisappointed": "becomes more transactional"
}
```

## How This Changes the Runner

### Current (run-personas.mjs):
```javascript
for (const sample of persona.sampleUtterances) {
  // Send pre-written message
  // Get AI response
  // Loop ends when utterances exhausted
}
```

### Proposed:
```javascript
let conversationActive = true;
let turnCount = 0;

while (conversationActive && turnCount < persona.termination.maxTurns) {
  // Generate persona's next message using LLM
  const userMessage = await generatePersonaResponse({
    persona: persona,
    conversationHistory: messages,
    lastAiResponse: lastResponse,
    lastMetadata: metadata,  // fitScore, stance, dialogueAct
    turnCount: turnCount
  });

  // Check if persona decided to end
  if (userMessage.type === 'exit') {
    conversationActive = false;
    // Log the exit type and reason
    break;
  }

  // Send message to guide API
  const response = await callChatAPI(userMessage.content, sessionId);

  // Store for next iteration
  lastResponse = response.text;
  metadata = response.metadata;
  turnCount++;

  // Check termination conditions
  if (shouldTerminate(persona.termination, metadata, turnCount)) {
    conversationActive = false;
  }
}
```

### The generatePersonaResponse Function:
```javascript
async function generatePersonaResponse({ persona, conversationHistory, lastAiResponse, lastMetadata, turnCount }) {
  const systemPrompt = `You are role-playing as a person with these characteristics:
${JSON.stringify(persona.behavioral, null, 2)}

Your objectives for this conversation:
${JSON.stringify(persona.objectives, null, 2)}

How to respond based on what the AI guide does:
${JSON.stringify(persona.responseStrategy, null, 2)}

When to end the conversation:
${JSON.stringify(persona.termination, null, 2)}

Current conversation state:
- Turn: ${turnCount}
- Last AI dialogue act: ${lastMetadata?.dialogueAct}
- Current fit score: ${lastMetadata?.fitScore}
- Current stance: ${JSON.stringify(lastMetadata?.stance)}

Based on the conversation so far and the guide's last response, generate your next message.
If you believe the conversation should end, respond with:
{"type": "exit", "exitType": "positive|negative|neutral", "reason": "why ending"}

Otherwise respond with:
{"type": "continue", "content": "your message to the guide"}`;

  return await callLLM(systemPrompt, conversationHistory);
}
```

## Benefits

1. **Variable length conversations**: 5-30 turns based on actual flow
2. **Realistic endings**: Persona decides when satisfied, frustrated, or done exploring
3. **Responsive dialogue**: Persona reacts to what AI actually says
4. **Testable behaviors**: Can verify AI triggers expected persona reactions
5. **No hard-coded scripts**: Schema drives behavior, not pre-written utterances

## Migration Path

1. Keep existing `sampleUtterances` for backwards compatibility
2. Add new fields as optional
3. Runner checks: if `termination` exists, use dynamic mode; else use scripted mode
4. Gradually update personas with new fields

## Example: Updated philosophical-thinker.json

```json
{
  "id": "philosophical-thinker",
  "name": "Philosophical Thinker",
  "archetype": "seeker",

  "behavioral": { /* existing */ },
  "cognitive": { /* existing */ },

  "opening": {
    "context": "Found this through unconventional channels, genuinely curious",
    "firstMessage": "Hi—I'm really interested in what you're building here. Can you tell me what this is about and who you're looking for?",
    "initialMood": "curious and engaged",
    "backstory": "Has been thinking deeply about how to live. Values both autonomy and genuine connection. Has done a lot of solo exploration but craves meaningful collaboration."
  },

  "objectives": {
    "primary": "Understand if this community can hold both individual freedom and collective purpose",
    "mustAnswer": [
      "How does autonomy work within the community structure?",
      "What's the philosophy behind how you organize?",
      "How do you handle it when people's visions conflict?"
    ],
    "satisfactionSignals": [
      "Guide engages with philosophical depth, not just logistics",
      "Genuine curiosity about my perspective, not just selling",
      "Acknowledges tensions and complexity rather than glossing over"
    ],
    "dissatisfactionSignals": [
      "Surface-level responses to deep questions",
      "Treating me as transactional when I'm exploring meaning",
      "Avoiding the hard questions about conflict and autonomy"
    ]
  },

  "termination": {
    "minTurns": 5,
    "maxTurns": 25,
    "positiveExit": {
      "triggers": ["Deep philosophical alignment felt", "My core questions answered thoughtfully"],
      "behavior": "Express genuine excitement, ask how to continue the conversation"
    },
    "negativeExit": {
      "triggers": ["Philosophy feels shallow or performative", "Guide can't engage with nuance"],
      "behavior": "Thank them politely, say this might not be the right fit for my depth of inquiry"
    }
  },

  "responseStrategy": {
    "toDialogueActs": {
      "probe_deeper": "Light up—share my own thinking, explore together",
      "validate_genuine": "Feel seen, may move toward commitment",
      "redirect_from_surface": "Appreciate the redirect, go deeper"
    },
    "toMisunderstanding": "Reframe with more precision, give concrete example"
  }
}
```
