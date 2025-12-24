# Testing Infrastructure

Data-driven persona system for regression testing the Educator Builder AI evaluator.

## Quick Start

```bash
# Interactive test (create golden cases)
npx playwright test testing/playwright.js --headed

# Regression tests (validate against baselines)
npx playwright test testing/personas/e2e-personas.spec.js
```

## Structure

```
testing/
  personas/                    # Persona definitions + E2E test
    *.json                     # Individual persona specs
    e2e-personas.spec.js       # Automated regression test
    schema.json                # Persona JSON schema
    README.md                  # Persona design guide
  golden-cases/                # Baseline expectations
    *.json                     # Golden case definitions
    schema.json                # Golden case schema (A/B/C tiers)
    README.md                  # How to create golden cases
  playwright.js                # Interactive E2E harness
  transcripts/                 # Turn-by-turn conversation logs (gitignored)
  screenshots/                 # Visual captures (gitignored)
  README.md                    # This file
```

## Personas (Data-Driven)

6 personas test specific rubric dimensions:

| Persona | Tests | Expected Dialogue Acts |
|---------|-------|------------------------|
| Philosophical Thinker | depth-of-questioning, systems-thinking, reciprocal-curiosity | probe_deeper, validate_genuine |
| Transactional Seeker | depth (low), self-awareness (surface) | redirect_from_surface, ask_for_concrete |
| Performative Philosopher | authenticity (low) | redirect_from_surface, ask_for_concrete |
| Authentic Inarticulate | authenticity (high), self-awareness (expression) | validate_genuine, reflect_understanding |
| Builder Experimenter | experimentation-evidence, self-awareness | probe_deeper, affirm_commitment |
| Systems Thinker | systems-thinking, reciprocal-curiosity | probe_deeper, validate_genuine |

Load personas from JSON files (`personas/{id}.json`) to run tests. See `personas/README.md`.

## Golden Cases (Regression Baselines)

Store expected vs. actual results for notable turns:
- `userMessage`: What persona said
- `expected`: `{ dialogueAct, speechAct, tier }`
- `actual`: `{ response, dialogueAct, rubricScores, fitScore }`
- `regressionStatus`: pass | fail | degrade

Create golden cases by:
1. Run interactive test
2. Identify notable turns
3. Extract from transcript
4. Fill expected values
5. Store as `{persona}-turn{N}-{description}.json`

See `golden-cases/README.md` and `golden-cases/schema.json`.

## Testing Modes

### Interactive Mode (playwright.js)
Real-time interaction. Opens browser, prompts you for persona responses each turn.
```bash
npx playwright test testing/playwright.js --headed
```
**Use for**: Developing personas, creating golden cases, debugging AI behavior

### Static Regression (e2e-personas.spec.js)
Automated test against golden cases. Fast, scriptable.
```bash
npx playwright test testing/personas/e2e-personas.spec.js
```
**Use for**: CI/CD, validating prompt/rubric changes, regression detection

## Metadata Captured Per Turn

```json
{
  "dialogueAct": "probe_deeper",
  "speechAct": "directive",
  "criteria": ["depth-of-questioning"],
  "rubricScores": { "depth-of-questioning": 8, ... },
  "fitScore": 75,
  "allFloorsPass": true,
  "rationale": "Clear philosophical engagement"
}
```

Compare against golden cases to detect regressions:
- Dialogue act mismatch → AI strategy changed
- Tier drop (A→B) → Quality degraded
- Rubric score shift >2pts → Evaluation threshold crossed

## Work Study Methodology

The chat itself is the assessment tool. Conversation depth, pace, and interaction patterns reveal more than scores alone.

### Key Signals (20+ Turn Conversations)

**Conversation Length as Fitness**
- 0-5 turns: Low engagement or quick disqualification
- 5-10 turns: Moderate interest, testing the waters
- 10-20 turns: Serious evaluation, genuine curiosity
- **20+ turns: Strong fit indicator** - person sees value in the tool as ongoing dialogue

**Pace as Thinking Style Metadata**
- Fast responses (< 30s turn time): Verbal thinker, speaks to process
- Measured responses (1-2min): Deliberative, thinking-while-typing
- Slow responses (> 2min): Deep thought before responding, written-first thinker

**Tone Trajectory**
- Authenticity score over time reveals consistency
- Dialogue acts track strategy changes (from questioning → deepening → committing)
- Fit score progression shows if they're finding genuine resonance or surface engagement

### Work Study as Filter

This isn't binary pass/fail validation. It's observing:
- **How do they think?** (pace + articulation)
- **Do they persist?** (turn count as commitment)
- **Are they authentic?** (authenticity scores, consistency over 20+ turns)
- **Can they engage deeply?** (dialogue acts, rubric dimensions hit)

A person who does 20+ turns with high authenticity, clear dialogue progression, and good fit score progression has self-selected as genuinely interested. The technology becomes transparent—the conversation itself is the assessment.

## Architecture Notes

For full context on evaluation pipeline, dialogue acts, and rubric integration, see `.claude/CLAUDE.md` → "Educator Builder - E2E Testing Context".
