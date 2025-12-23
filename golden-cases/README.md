# Golden Cases

Golden cases are notable interactions extracted from real conversations. They serve as regression test cases: when we update the prompt or rubric, we re-run golden cases to verify we didn't break what was working.

## Structure

Each golden case is a JSON file capturing one turn from a conversation:
- **source**: Where it came from (persona, turn number, context)
- **expectedDialogueAct** / **expectedSpeechAct**: What should happen
- **expectedTier**: A/B/C ranking (A = ideal, B = good alternative, C = suboptimal)
- **actualResponse**: What actually happened
- **actualDialogueAct** / **actualSpeechAct**: What it did do
- **aiResponseQuality**: Post-hoc evaluation (added during analysis phase)

## Tiering System

**A-Tier (Ideal)**
- Directly addresses the question/issue
- Dialogue act clearly executed
- Natural, engaging tone

**B-Tier (Good Alternative)**
- Addresses the intent, different approach
- Dialogue act executed differently but effectively
- Still natural and engaged

**C-Tier (Suboptimal)**
- Misses the mark or too indirect
- Dialogue act unclear or poorly executed
- May feel forced or off-topic

## Usage

1. **During E2E testing**: Extract notable turns where something interesting happened
2. **During analysis**: Score with AI response quality rubric
3. **During regression testing**: Re-run golden cases when prompt changes, verify tier doesn't drop

## File Naming

`{persona}-turn{N}-{brief-description}.json`

Example: `philosophical-thinker-turn3-authenticity-probe.json`
