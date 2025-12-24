# Communication Modalities & Referral Network

## Voice + Text Modality System

Users choose how they want to communicate. Not a constraint—**a feature for accessibility and preference matching**.

### Input Modalities

**Voice Input**
- Browser microphone (getUserMedia)
- Record turns as audio
- Send to backend for speech-to-text (Groq Whisper)
- Cost: $0 (Groq API included)
- Signal: Speech rate, hesitation patterns, tone
- User experience: Press-to-talk or continuous recording

**Text Input**
- Traditional text typing
- Signal: Typing speed (words/min), pause patterns between phrases
- User experience: Chat interface (familiar)

### Output Modalities

**Voice Output (AI Speaking)**
- Text-to-speech synthesis
- Narrates AI responses
- Audio player with transcript sync (transcript scrolls with playback)
- Cost: ~$0.001-0.003 per message (TTS API)
- User experience: Listen to guide responses

**Text Output**
- Traditional chat interface
- Transcript visible immediately
- User experience: Fast, skimmable

### Combinations (4 Paths)

| Input | Output | Best For | Signal |
|-------|--------|----------|--------|
| Voice | Voice | Conversational, phone-like | Speech patterns, natural dialogue |
| Voice | Text | Accessibility (hearing aid users), fast readers | Speech patterns + reading preference |
| Text | Voice | Screen reader users, commute listening | Typing patterns + listening preference |
| Text | Text | Standard chat experience | Typing patterns, deliberation |

**Default UX Flow:**
1. User lands on app
2. "How do you prefer to communicate?"
3. Two buttons: "I'll speak" or "I'll type"
4. Second button: "Do you want to hear me speak or read my responses?"
5. System remembers preference per user

### Metadata Captured Per Modality

**Voice Input Signal:**
- Speech rate (WPM from audio duration + transcribed word count)
- Pause patterns (hesitation, thinking time)
- Tone/affect (from voice analysis)
- Clarity (transcription confidence score)

**Text Input Signal:**
- Typing speed (WPM from keystroke timing—if captured)
- Edit frequency (if tracked)
- Thinking time (pauses between messages)

**Output Preference:**
- Voice output users: value hearing tone, prefer ears-free interaction
- Text output users: value speed, skimmability, accessibility

---

## Referral Network System

**Goal**: Invite-only community where members invite friends, creating natural growth and demand signal.

### Architecture

**User Roles**
- `seeded_founder`: First 1-3 people invited directly by you (admin signup)
- `invited_member`: Invited by existing member
- `pending_invite`: Email sent, not yet signed up

**Signup Flow**
1. **Seeded founders** get direct access code
2. **They invite friends** via "Invite" button → send email invite link
3. **Invites are tracked** with referrer ID
4. **New user signs up** via email link → auto-joins network
5. **Metrics tracked** who invited whom, when, conversion rate

### Invitation Mechanics

**Email Invite**
```
Subject: You're invited to Educator Builder

Hi {friend_name},

{inviter_name} thinks you'd be a great fit for Educator Builder.

We're looking for people who think deeply about how they work and learn.

Accept invite: [unique_link_with_code]

This link expires in 7 days.
```

**Signup Page**
- Show: who invited you, why they thought of you
- Email pre-filled from invite
- Sign up button creates account + marks invite as converted

**Account Created**
- User immediately gets "Invite friends" button
- Can invite unlimited people
- See list of people you've invited + their status

### Metrics Tracked (Per User)

**Referral Metrics:**
- `invited_by`: User ID of inviter (null if founder)
- `invite_date`: When they received invite
- `signup_date`: When they accepted
- `conversion_time`: Days between invite and signup
- `referrals_sent`: Count of people they've invited
- `referrals_converted`: How many of their invites signed up
- `invite_influence`: Quality of their referrals (avg success indicators of people they invited)

**Network Growth:**
- Referral tree depth (how many generations from founders)
- Conversion rate by generation (founders → gen 1 → gen 2, etc.)
- Viral coefficient: Average people each user invites who convert

### Demand Signal (Why This Matters)

**Metrics that show real demand:**
1. **How many people do they invite?** More = they believe in it
2. **How many convert?** Higher = they're credible in their network
3. **Who are they inviting?** Network composition (builders, philosophers, operators?)
4. **How fast do invites convert?** Speed = social proof

**Example insights:**
- Founder invites 5 people, 4 convert in 3 days → strong product-market fit signal
- Person invites 2, both convert, both invite more → viral loop starting
- Founder invites 10, 1 converts, slow → product-market fit weak in that network

### Closing Recruitment (Flip the Sign)

When you want to pause:
1. **Admins toggle**: "Invitations Paused"
2. **Users see**: "Invitations currently closed. Join waitlist?"
3. **System still tracks**: How many waitlist requests (demand signal)
4. **Metrics**: Who wanted in, how many, in what order

---

## Success Probability Equation

With all this data, compute per-user success probability:

```
success_probability = f(
  // Core engagement
  turn_count,
  authenticity_average,
  authenticity_consistency,
  fit_score_progression,

  // Thinking style
  response_time,
  words_per_minute,
  thinking_style,

  // Depth
  question_depth_progression,
  philosophy_probes,
  value_alignment_ratio,

  // Commitment
  future_language_count,
  ownership_language_count,
  explicit_commitment_turns,
  commitment_progression,

  // Resilience & Growth
  resilience_rating,
  self_awareness_growth,
  engagement_sustainability,

  // Modality match
  communication_modality_preference,
  modality_consistency
)
```

**Weight the equation based on:**
- What matters most for your community?
- High authenticity users > high turn count users?
- Philosophy probes > practical questions?
- Fast engagement > deep engagement?

That's your tuning vector.

---

## Technical Checklist

**Voice + Text:**
- [ ] Flutter integration for getUserMedia (voice/text)
- [ ] Groq Whisper integration for transcription
- [ ] TTS backend (optional, for voice output)
- [ ] Transcript sync with audio playback
- [ ] Modality preferences stored per user

**Referral:**
- [ ] Invite code generation (7-day expiry)
- [ ] Email invite template
- [ ] Referral tree tracking (invited_by relationships)
- [ ] Conversion metrics
- [ ] Waitlist when closed
- [ ] Admin toggle for pause/resume

**Success Indicators:**
- [ ] All metadata fields populated per conversation
- [ ] Success probability computation
- [ ] User profile dashboard (show their own metrics)
- [ ] Admin dashboard (network growth, demand signal, success curve)
