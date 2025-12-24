# User Engagement Metrics

The metadata service computes metrics from conversation history to build a profile of how individuals think and engage. These metrics work across multiple conversations to reveal **thinking style, authenticity, engagement depth, and attention patterns**.

## Per-Conversation Metrics

### Pace (Thinking Style)

**Average Response Time (seconds)**
- Time between user sending message and user reading response + formulating next message
- Measured: median across all turns
- Low (< 30s): Verbal thinker, thinks-while-speaking style
- Medium (30-120s): Balanced, deliberate but not overthinking
- High (> 120s): Deep reflector, writes carefully before sending

**Words Per Minute (WPM)**
- Total user message words ÷ total conversation time
- Low (< 50 WPM): Careful, chosen words, written-first thinker
- Medium (50-100 WPM): Standard conversational pace
- High (> 100 WPM): Fast communicator, verbal style

**Inferred Thinking Style**
- `verbal_thinker`: Fast response + high WPM (< 30s, > 100 WPM)
- `fast_communicator`: High WPM, moderate response time
- `deliberate_writer`: Slow response + low WPM (> 120s, < 50 WPM)
- `deep_reflective_thinker`: Slow response, moderate WPM
- `balanced_thinker`: Everything moderate

### Attention Span

**Plateau Turn**
- The turn number where fit score stabilizes (variance < 25 across 3-turn windows)
- Indicates when the person has fully understood the opportunity and engagement levels off
- Early plateau (5-7 turns): Quick evaluation, fast decision-maker
- Late plateau (15+ turns): Thorough, wants to understand deeply

**Example**: If plateau is at turn 12, the person fully understood fit by turn 12. Turns 13+ are confirming/deepening, not new evaluation.

### Authenticity

**Average Authenticity Score**
- Per-turn authenticity (0-10) averaged across conversation
- Reflects consistency of genuine engagement vs. performed interest

**Authenticity Variance**
- Low variance (< 0.5): Person is consistently authentic (high signal)
- High variance (> 2.0): Person shifts between authentic and performative (mixed signal)
- This matters: **consistent authenticity > high average with variance**

### Breadth of Thought

**Unique Dialogue Acts**
- How many different engagement strategies did the AI use?
- Wide breadth (4+ dialogue acts): Person explored many angles
- Narrow breadth (1-2 dialogue acts): Person stayed focused on specific questions

**Unique Rubric Dimensions**
- How many different evaluation criteria were touched?
- Indicates whether conversation was narrow (logistics only) vs. broad (philosophy + logistics + operations)

### Fit Score Arc

**Early vs. Late Fit**
- First third of conversation: initial fit perception
- Last third of conversation: final fit after understanding
- Progression: late fit - early fit
- Positive progression: person gets more convinced the longer they talk
- Flat: person knew fit early, didn't change
- Declining: person became less convinced (red flag)

## User-Level Profile (Across Conversations)

### Key Aggregates

**Total Turns Across Conversations**
- Primary engagement signal
- 0-10 turns: Testing the waters
- 10-30 turns: Serious evaluation (2-3 conversations)
- 30-100 turns: Deep exploration (5-10 conversations, committed)
- 100+ turns: Member-level engagement

**Average Turns Per Conversation**
- How long does this person stay in a single conversation?
- 3-5 turns avg: Quick evaluator
- 10-15 turns avg: Thorough, wants to understand
- 20+ turns avg: Deep thinker, seeks full understanding

**Pace Consistency Across Conversations**
- Does this person think the same way every time?
- Stable pace: Reliable thinking style
- Variable pace: Adapts to conversation (flexible) or inconsistent (unstable)

**Authenticity Across Conversations**
- Is this person consistently genuine across different interactions?
- High average + low variance = reliable, authentic person
- High average + high variance = sometimes genuine, sometimes performing

### Engagement Profile

Synthesis of all metrics into human-readable signals:

**Example 1: "High Engagement + Authentic + Improving"**
```
- Total Turns: 45
- Avg Turns Per Conversation: 15
- Thinking Style: Balanced Reflective
- Authenticity: 8.2 (high, consistent)
- Plateau Turn: 12 (deep engagement)
- Fit Progression: +8 (improving over conversations)
→ Signal: Sustained commitment, genuine interest, deepening understanding
```

**Example 2: "Quick Decision + Authentic + Improving"**
```
- Total Turns: 28
- Avg Turns Per Conversation: 7
- Thinking Style: Fast Verbal Communicator
- Authenticity: 8.5 (high, consistent)
- Plateau Turn: 5 (quick connector)
- Fit Progression: +12 (strong improvement)
→ Signal: Efficient evaluator, knows quickly if good fit, commitment when confident
```

**Example 3: "High Volume + Variable Authenticity + Declining"**
```
- Total Turns: 60
- Avg Turns Per Conversation: 12
- Thinking Style: Deliberate Writer
- Authenticity: 6.5 (moderate, variable)
- Plateau Turn: 8 (moderate engagement)
- Fit Progression: -3 (declining fit)
→ Signal: Overthinking, not sure what they want, authenticity questions (yellow flag)
```

## Voice Input: Additional Metrics

If adopting voice input, add:

**Speech Rate (WPM)**
- Native WPM from voice, unfiltered by typing
- More natural thinking speed
- Verbal thinkers will show much higher WPM in voice vs. text

**Pause Patterns**
- Frequency and length of pauses
- Long pauses: Deep thinking
- Short pauses: Verbal flow
- No pauses: Reading script (inauthentic)

**Tone/Affect Variation**
- Enthusiasm level
- Consistency of tone (monotone vs. varied)
- Alignment with claimed interest

## What These Metrics Reveal

### Thinking Style Matters
- Verbal thinker benefits from real-time dialogue, may underperform in text
- Deliberate writer needs time to respond, may seem slow but is thorough
- Matching communication style to person's natural style increases authenticity

### Engagement Length = Commitment
- **20+ turns in conversation = genuine interest signal**
- If someone talks 20 turns, they've self-selected (no external pressure)
- The work study isn't testing them; it's them testing the fit

### Authenticity Consistency > Peak Score
- A person with Auth 7/10 consistently beats Auth 9/10 with high variance
- Reliable authenticity is more predictive than brilliant moments

### Plateau = Understanding Point
- When fit score plateaus, the person understands fit
- Continuing past plateau is deepening commitment, not evaluation
- Early exit before plateau = rejected; exit after plateau = accepted

## Using These Metrics for Placement

1. **Identify thinking style** (pace metrics) → Match communication approach
2. **Check authenticity consistency** → Red flags if variable
3. **Evaluate breadth** → Deep philosopher vs. practical builder
4. **Look at progression** → Is person convinced or unconvinced over time?
5. **Total turns** → Engagement commitment signal

A person with 30+ total turns, high authenticity consistency, balanced pace, and improving fit progression across conversations is a **strong signal** of genuine fit, independent of any single conversation score.
