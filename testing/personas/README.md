# Personas

Data-driven personas for regression testing. Each persona is a JSON file specifying behavioral characteristics, target rubric dimensions, and expected dialogue acts.

## Concept

- **Personas are interchangeable**: Load any persona JSON into test harness, test logic unchanged
- **Tests specific dimensions**: Each persona designed to exercise particular rubric criteria
- **Elicits expected dialogue acts**: AI's response type varies by persona; validates strategy consistency
- **Behavioral specification**: Not demographic profiles—behavioral patterns that can be evaluated for consistency

## Schema

See `schema.json` for complete JSON specification. Key fields:
- `id`, `name`, `archetype`, `tier`
- `behavioral`: communicationStyle, reasoningStyle, authenticityLevel, responsePatterns
- `cognitive`: selfAwareness, systemsThinking, valuesProfile
- `targetRubricDimensions`: Which rubric criteria this persona tests
- `expectedDialogueActs`: What dialogue acts AI should execute
- `sampleUtterances`: Example messages

## Persona Files

Each persona is a separate JSON file following the schema:

- `philosophical-thinker.json` - Deep questions, systems thinking, authentic
- `transactional-seeker.json` - Logistics only, surface-level
- `performative-philosopher.json` - Sophisticated language, no substance
- `authentic-inarticulate.json` - Genuine but struggles to articulate
- `builder-experimenter.json` - Concrete examples, experimental mindset
- `systems-thinker.json` - Sees interconnections, sophisticated

## Using Personas

Load in test harness:
```javascript
const personas = fs.readdirSync('testing/personas')
  .filter(f => f.endsWith('.json') && f !== 'schema.json')
  .map(f => JSON.parse(fs.readFileSync(`testing/personas/${f}`)));

for (const persona of personas) {
  // Run test with persona
  // Verify: dialogueAct matches expected
  // Verify: rubricScores target dimensions
  // Verify: no tier degradation vs golden cases
}
```

## Adding a Persona

1. Create new JSON file following `schema.json`
2. Specify `targetRubricDimensions` (what to test)
3. Specify `expectedDialogueActs` (what AI should do)
4. Add `sampleUtterances` (realistic messages)
5. Run interactive test to validate consistency
6. Create golden cases from notable turns

## Validation

When running tests:
- **Dialogue act mismatch**: Did AI strategy change for this persona type?
- **Tier drop**: Did response quality degrade?
- **Rubric score shift**: Did evaluation threshold cross?
- **Persona drift**: Does persona remain consistent across turns?
