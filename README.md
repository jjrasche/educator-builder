# Educator + 3CS Builder

AI-powered hiring funnel with Grok chat, project selection, and Calendly scheduling.

## What's Built

- **Real Grok AI chat** - streams responses, not canned
- **Email gate** - requires email after 5 exchanges
- **Transcript delivery** - sends full conversation to both parties
- **Project swipe** - Tinder-style project selection
- **Calendly embed** - real scheduling

## Stack

- Frontend: Vanilla JS + Tailwind (static HTML)
- Backend: Vercel serverless functions
- AI: Groq (Llama 3.1 70B)
- Email: Resend
- Scheduling: Calendly

## Deploy to Vercel

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Install dependencies
npm install

# 3. Deploy
vercel

# 4. Set environment variables in Vercel dashboard:
# - GROQ_API_KEY (get from https://console.groq.com)
# - RESEND_API_KEY (get from https://resend.com)
# - ADMIN_EMAIL (your email for transcripts)
# - CALENDLY_URL (your Calendly link)
```

## Environment Variables

Create these in Vercel dashboard (not in code):

```bash
GROQ_API_KEY=gsk_...
RESEND_API_KEY=re_...
ADMIN_EMAIL=jim@jimr.fyi
CALENDLY_URL=https://calendly.com/your-username/educator-builder
```

## How It Works

### Stage 1: Chat (Groq API)
- Streams responses from Groq (Llama 3.1 70B)
- After 5 exchanges → email gate
- Stores full transcript

### Stage 2: Projects
- Swipe left/right on 3 projects
- Stores selections

### Stage 3: Commitment
- Hours slider (10-60/month)
- Name + email fields

### Stage 4: Schedule
- Sends transcript to both parties
- Loads Calendly widget

## Local Development

```bash
# Install dependencies
npm install

# Run Vercel dev server
vercel dev

# Open http://localhost:3000/app
```

## Funnel Metrics

Track these manually (no analytics yet):

- Total visitors (GitHub Pages analytics)
- Email submissions (count emails)
- Project preferences (read transcripts)
- Calendly bookings (Calendly dashboard)

## Next Steps

- [ ] Update Calendly URL in `app/index.html` (line 558)
- [ ] Get Groq API key from https://console.groq.com
- [ ] Get Resend API key from https://resend.com
- [ ] Deploy to Vercel
- [ ] Configure DNS (jimr.fyi → Vercel nameservers)
- [ ] Test full flow
- [ ] Share with first candidates

## Files

```
/
├── app/
│   └── index.html          # Frontend (Grok chat + funnel)
├── api/
│   ├── chat.js             # Groq API streaming
│   └── send-transcript.js  # Email via Resend
├── package.json
└── README.md
```

## Cost

- Groq API: ~$0.10/conversation (100 turns) - Free tier available
- Resend: Free (100 emails/day)
- Vercel: Free tier
- Calendly: Free tier

**Total:** ~$0.10 per applicant (or free on Groq free tier)
