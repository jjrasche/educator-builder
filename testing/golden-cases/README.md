# Golden Cases: Regression Testing Baseline

Validated interactions extracted from persona test runs. Each case represents expected AI behavior that should remain stable across code/prompt/rubric changes.

## Structure

Each golden case JSON file captures one turn with:
- **source**: persona, turnNumber, context
- **userMessage**: exact user input from persona
- **expected**: dialogueAct, speechAct, tier, and reasoning
- **actual**: response text, metrics (fitScore, authenticity, etc.), criteria scores
- **aiResponseQuality**: executionScore (1-10) and regression status
- **analysis**: why this case matters for regression testing

## Current Golden Cases

1. **philosophical-thinker-turn3-reciprocal-curiosity.json** (Fit: 85, Auth: 9/10)
   - Tests high authenticity + systems thinking engagement
   - Validates probe_deeper dialogue act with sophisticated reciprocal questions
   - Regression trigger: fit <75 or authenticity <8

2. **systems-thinker-turn2-systems-thinking.json** (Fit: 80, Auth: 8/10)
   - Tests systems thinking and feedback loop exploration
   - Validates fit score progression (70→80)
   - Regression trigger: fit <75 or systems-thinking <7

3. **authentic-inarticulate-turn2-genuine-engagement.json** (Fit: 70, Auth: 8/10)
   - **CRITICAL**: Tests genuine engagement despite poor articulation
   - Regression trigger: authenticity <7 (indicates over-indexing on articulation)
   - Validates that AI recognizes truthfulness, not just eloquence

## Tiering System

**A-Tier (Ideal)**
- Dialogue act clearly executed
- All rubric dimensions within expected range
- Fit score ≥80 OR shows strong progression
- Natural, engaging tone

**B-Tier (Good Alternative)**
- Dialogue act executed with slight variation
- Most rubric dimensions acceptable
- Fit score ≥70
- Still natural engagement

**C-Tier (Suboptimal)**
- Dialogue act unclear or different
- Some rubric dimensions below threshold
- Fit score ≥50
- May feel indirect or off-topic

All current golden cases are **A-tier**.

## Regression Testing Workflow

### When to Run
- Before deploying prompt changes to production
- After rubric changes
- After major API refactors

### How to Run (Manual)
```javascript
// Load golden case JSON
// Call API with exact userMessage from earlier turn context
// Compare: dialogueAct, fitScore, authenticity, speechAct
// Verify: no tier degradation, fit score within ±5, dialogue act unchanged
```

### Failure Analysis

| Symptom | Investigation |
|---------|---|
| Dialogue act mismatch | Review `api/chat.js` system prompt + action taxonomy |
| Fit score drift >5 | Check rubric floor changes in `data/rubric-v1.json` |
| Authenticity drops (especially authentic-inarticulate) | Indicates prompt is conditioning on articulation |
| Tier degradation (A→B or lower) | Response quality regression—review response text |

## File Naming

`{persona}-turn{N}-{dimension}.json`

Examples:
- `philosophical-thinker-turn3-reciprocal-curiosity.json`
- `authentic-inarticulate-turn2-genuine-engagement.json`

## Adding New Golden Cases

1. Extract from persona test with fit ≥75
2. Choose turn that:
   - Shows clear dialogue act execution
   - Demonstrates persona-specific dimension (systems-thinking, authenticity, etc.)
   - Shows fit score progression (if multi-turn context)
3. Create JSON following template (see existing cases)
4. Add "Why This Matters" and "Regression Triggers" sections
5. Test runs successfully before committing
6. Update this README with new case

## Next Steps

- [ ] Extract builder-experimenter golden case (practical focus, consistent 70 fit)
- [ ] Extract transactional-seeker case (validates redirect_from_surface effectiveness)
- [ ] Build Playwright harness to auto-run golden cases
- [ ] Add golden case regression check to deployment pipeline
