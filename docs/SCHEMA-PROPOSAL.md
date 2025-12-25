# Realistic Synthetic Conversation Schema v2

## Summary

This document proposes an industry-standard persona schema for generating realistic synthetic conversations. The schema is based on research from:

- **Microsoft TinyTroupe** - Detailed persona simulation with Big Five personality
- **Google Synthetic-Persona-Chat** - Generator-Critic architecture for conversation quality
- **EmoUS** - Emotional user simulation for dialogue systems
- **PSYDIAL** - Personality-based (Big Five) dialogue generation
- **Persona Hub (Tencent)** - Billion-scale persona generation
- **Self-Emotion Blended Dialogue** - Research showing 55% decision change when emotions tracked

## Key Changes from v1

| Aspect | v1 Schema | v2 Schema |
|--------|-----------|-----------|
| Personality | Custom traits only | Big Five (OCEAN) + traits + values + beliefs |
| Emotions | Not tracked | Full emotional profile with triggers and expression |
| Communication | Basic style enum | Verbosity, formality, directness, linguistic markers |
| Termination | Not specified | Full positive/negative/neutral exit conditions |
| Turn behavior | Not specified | Acknowledgment, circling back, response strategies |
| Identity | Name + archetype | Full background, situation, occupation |
| Prompt guidance | Not present | Natural language instructions for LLM |

## Industry Best Practices Incorporated

### 1. Big Five Personality Model (OCEAN)
From PSYDIAL and TinyTroupe research. Each dimension 1-10:
- **Openness**: Creativity, curiosity, new experiences
- **Conscientiousness**: Organization, self-discipline
- **Extraversion**: Sociability, assertiveness
- **Agreeableness**: Cooperation, trust
- **Neuroticism**: Emotional instability, anxiety

Research shows personality affects linguistic style at all levels - extraverts use more frequent words and longer sentences, introverts use rare words.

### 2. Emotional State Tracking
From EmoUS and Self-Emotion Blended Dialogue research:
- **Initial state**: Mood, valence (-1 to 1), arousal (0 to 1)
- **Triggers**: What causes positive/negative emotional shifts
- **Expression style**: How emotions manifest in language

Key finding: Agents tracking self-emotion show **~55% change in decision-making** and conversations are rated more natural, empathetic, and human-like.

### 3. Turn Structure & Acknowledgment
From conversation analysis research:
- Always acknowledge previous response before moving forward
- Circle back to unanswered questions naturally
- Bundle multiple threads in single turns (reaction + clarification + new question)

This eliminates the need for complex batching - the prompt guidance handles responsiveness.

### 4. Termination Conditions
From dialogue system research on conversation completion:
- **Positive exit**: Conditions, signals, behavior, example
- **Negative exit**: Conditions, signals, behavior, example
- **Neutral exit**: Conditions, behavior
- **Min/max turns**: Boundaries for natural length

### 5. Prompt Guidance
The `promptGuidance` field is natural language instructions that tell the LLM how to embody all the schema attributes in actual conversation. This is the most important field - it's what makes the schema actionable.

## Schema Structure

```
persona/
├── id, name, description
├── identity/
│   ├── age, gender, occupation
│   ├── location, background
│   └── currentSituation
├── personality/
│   ├── bigFive (OCEAN scores)
│   ├── traits, values, beliefs
├── emotionalProfile/
│   ├── initialState (mood, valence, arousal)
│   ├── triggers (positive/negative shifts)
│   └── expressionStyle
├── communicationStyle/
│   ├── verbosity, formality, directness
│   ├── questioningStyle
│   └── linguisticMarkers
├── conversationConfig/
│   ├── opening (context, firstMessage, stance)
│   ├── objectives (primary, questions, hidden agenda)
│   ├── turnBehavior (acknowledge, circle back, share info)
│   ├── responseToGuide (when probed/validated/misunderstood)
│   └── termination (positive/negative/neutral exits)
├── promptGuidance (natural language LLM instructions)
└── testing/
    ├── targetDimensions
    ├── expectedGuideActions
    └── successCriteria
```

## How Conversations Are Generated

**Single LLM call approach** (no batching needed):

```javascript
async function generateConversation(persona) {
  const systemPrompt = `
You are role-playing as ${persona.name}.

IDENTITY:
${JSON.stringify(persona.identity, null, 2)}

PERSONALITY (Big Five):
${JSON.stringify(persona.personality.bigFive, null, 2)}
Traits: ${persona.personality.traits.join(', ')}
Values: ${persona.personality.values.join(', ')}

EMOTIONAL STATE:
Starting mood: ${persona.emotionalProfile.initialState.mood}
Positive triggers: ${persona.emotionalProfile.triggers.positiveShift.join(', ')}
Negative triggers: ${persona.emotionalProfile.triggers.negativeShift.join(', ')}

COMMUNICATION STYLE:
${JSON.stringify(persona.communicationStyle, null, 2)}

OBJECTIVES:
${JSON.stringify(persona.conversationConfig.objectives, null, 2)}

TURN BEHAVIOR:
${JSON.stringify(persona.conversationConfig.turnBehavior, null, 2)}

HOW TO RESPOND TO GUIDE:
${JSON.stringify(persona.conversationConfig.responseToGuide, null, 2)}

WHEN TO END:
${JSON.stringify(persona.conversationConfig.termination, null, 2)}

IMPORTANT GUIDANCE:
${persona.promptGuidance}

Generate a realistic conversation with the guide. Start with your opening message.
Your emotional state should evolve based on how the guide responds.
End naturally when termination conditions are met.
`;

  return await llm.generate(systemPrompt);
}
```

The LLM generates the full conversation in one call because the prompt guidance tells it:
- How to acknowledge and react to responses
- When to circle back to unanswered questions
- How emotions evolve based on the interaction
- When and how to end

## Example Personas

See `/testing/personas/examples/`:
- `philosophical-thinker-v2.json` - Deep engagement, tests philosophical depth
- `transactional-seeker-v2.json` - Logistics only, tests handling of different orientations

## Migration from v1

The v2 schema is a superset. Migration path:
1. Keep existing personas working (backwards compatible)
2. Add new fields incrementally
3. `promptGuidance` can be generated from existing fields initially

## Sources

- [Microsoft TinyTroupe](https://github.com/microsoft/TinyTroupe) - Persona simulation framework
- [Google Synthetic-Persona-Chat](https://huggingface.co/datasets/google/Synthetic-Persona-Chat) - Conversation dataset
- [PSYDIAL](https://arxiv.org/html/2404.00930v1) - Personality-based dialogue generation
- [EmoUS](https://arxiv.org/abs/2306.01579) - Emotional user simulation
- [Persona Hub](https://github.com/tencent-ailab/persona-hub) - Billion-scale personas
- [Self-Emotion Blended Dialogue](https://aclanthology.org/2024.sigdial-1.21.pdf) - Emotion's effect on dialogue
- [Personality-affected Emotion Generation](https://arxiv.org/html/2404.07229v1) - Big Five → emotions
- [Emotion-Sensitive Dialogue Policy](https://www.nature.com/articles/s41598-024-70463-x) - Emotion as reward signal
