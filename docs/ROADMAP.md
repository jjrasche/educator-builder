# Implementation Roadmap

**Cost:** ~$0.02 per person (all features)
**Timeline:** 2-3 weeks for referral network + voice/text + success indicators
**First cohort:** Seeded invite (5-10 people) → watch network grow

## Phase 1: Referral Network Foundation (Week 1)

Essential for demand signal + community building.

**Backend (api/)**
- [ ] Invite code generation & validation
- [ ] User referral relationships (invited_by)
- [ ] Email service integration (SendGrid/Resend)
- [ ] Invite status tracking (pending, converted, expired)
- [ ] Admin toggle for recruitment pause

**Database**
- [ ] Users table: email, created_at, invited_by, modality_preference
- [ ] Invites table: code, inviter_id, invitee_email, status, created_at, expires_at
- [ ] Conversations table: user_id, turn_count, metrics (from metadata service)

**Email Templates**
- [ ] Invite email (why this person, unique link)
- [ ] Welcome email (first steps, who invited you)
- [ ] Referral prompt ("Invite people you know")

## Phase 2: Voice + Text Modality (Week 1-2)

Enable communication flexibility. This is where thinking style data comes from.

**Frontend (Flutter)**
- [ ] Modality selection screen (voice or text)
- [ ] Voice input: getUserMedia, press-to-talk
- [ ] Text input: standard chat interface
- [ ] Output preference: voice (TTS) or text
- [ ] Transcript + audio sync (highlight current word)

**Backend**
- [ ] Speech-to-text integration (Groq Whisper)
- [ ] TTS endpoint (optional: ElevenLabs or Google Cloud)
- [ ] Store audio transcripts (not raw audio files)
- [ ] Modality data in conversation metadata

## Phase 3: Expanded Success Indicators (Week 2)

All the detailed metrics that feed into success probability.

**Metadata Service (api/metadata.js)**
- [x] Question depth progression (philosophy vs. practical)
- [x] Commitment signals (future language, ownership language)
- [x] Value alignment ratio
- [x] Resilience rating
- [x] Self-awareness growth detection
- [x] Engagement sustainability
- [x] User profile across conversations

**API Integration**
- [ ] Compute metrics per-conversation automatically
- [ ] Aggregate user profile across conversations
- [ ] Expose metrics in dashboard

## Phase 4: Success Probability Dashboard (Week 3)

Make the data visible and actionable.

**Admin Dashboard**
- [ ] Network graph (who invited whom, conversion rate)
- [ ] Growth metrics (signups per day, referral velocity)
- [ ] Demand signal (invites sent, conversion rate by generation)
- [ ] Top referrers (who invited people, how many converted)
- [ ] Cohort analysis (seeded founder metrics vs. their invites)

**User Dashboard**
- [ ] Your success indicators (all fields)
- [ ] Your conversations (turn count, fit arc, authenticity)
- [ ] Your referrals (who you invited, their status)
- [ ] Your thinking profile (pace, authenticity, depth, commitment)

**Success Probability Computation**
- [ ] Weighted equation per user
- [ ] Show match likelihood vs. role/community
- [ ] Flag signals (high authenticity, improving fit, deep engagement)

## Deployment & Launch

**Pre-Launch Checklist**
- [ ] All referral mechanics working
- [ ] Voice/text capture end-to-end (Flutter → API → transcription)
- [ ] Success indicators computing correctly
- [ ] Email invites sending reliably
- [ ] Admin pause/resume toggle tested

**Seed Cohort (5-10 people)**
- Invite directly via admin email
- Watch: who invites friends, conversion speed, network growth
- Collect feedback: modality experience, any data glitches

**Demand Signal Gates**
- After 1 week: pause if referral velocity too high (can't handle demand)
- After 1 month: analyze network composition (who's recruiting whom?)
- Use waitlist data to guide future cohorts

## What Gets Built First

**Week 1 Focus:**
1. Referral system (highest ROI, enables everything else)
2. Voice/text modality selection (user preference)
3. Basic success indicator computation

**Week 2 Focus:**
1. Speech-to-text integration
2. Transcript sync with audio
3. User profile aggregation

**Week 3 Focus:**
1. Dashboards (see what you built)
2. Success probability equation
3. Polish & launch

---

## Why This Order

**Referral first** because:
- You immediately see demand (who's inviting)
- Network growth is your marketing (not ads)
- Every metric becomes more valuable with more people

**Voice/text early** because:
- Captures thinking style from day 1
- More authentic signal than text-only
- Flutter integration is non-blocking (can parallelize)

**Success indicators throughout** because:
- Data-oriented approach from foundation
- Not bolting on later
- Builds confidence in the matching system

---

## Cost Tracking

**Per person, per 20-turn conversation:**
- Groq LLM: $0.007
- Groq Whisper (speech-to-text): $0
- TTS (optional): +$0.003
- Storage: negligible
- **Total: $0.007-0.010**

**Per person, 3 conversations (evaluation):**
- **~$0.02-0.03**

**Operational costs (monthly):**
- Database: ~$5 (Vercel Postgres)
- Email service: free tier for <1K emails
- TTS (if enabled): ~$0.01 per user

**You can shut down anytime.** No lock-in contracts.

---

## Success Metrics to Watch

**Referral Network**
- Invites sent per seeded member
- Conversion rate (invite → signup)
- Time to conversion
- Referral tree depth (generations)
- Viral coefficient

**Engagement**
- % completing 20-turn conversations
- Authenticity consistency
- Question depth progression
- Commitment language frequency

**Community Quality**
- Philosophy/practical ratio
- Value alignment diversity
- Resilience (how they handle tension)
- Self-awareness growth

Use these to refine the success equation weights over time.
