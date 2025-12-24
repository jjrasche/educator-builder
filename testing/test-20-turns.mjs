import http from 'http';
import crypto from 'crypto';

function makeRequest(messages) {
  return new Promise((resolve, reject) => {
    const sessionId = crypto.randomBytes(8).toString('hex');
    const postData = JSON.stringify({
      messages,
      sessionId,
      email: 'test@example.com'
    });

    const options = {
      hostname: 'localhost',
      port: 3002,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const lines = data.split('\n').filter(l => l.trim());
          let parsed = null;
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const json = line.substring(6);
              if (json !== '[DONE]') parsed = JSON.parse(json);
            }
          }
          resolve(parsed || {});
        } catch(e) {
          resolve({ error: e.message });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

const authenticInarticulateUtterances = [
  "Um, so I'm really interested but I'm not sure how to like... explain it well. I feel like I'd learn a lot but I'm nervous about not being smart enough or something. Is that... is that okay?",
  "That's really nice to hear. So like... when things don't work out, is that bad? Or like, is it okay to mess up while learning?",
  "Yeah, that makes sense. So like, what would I actually be doing? Like what's a real example of work I'd be working on?",
  "Okay, that sounds cool. Um, I guess I'm wondering like... how many people are usually involved in things? Like is it just a few people or like a bigger group?",
  "Oh okay, so it changes depending on the project. That's actually really cool. Um, do you like, think about like what kind of people would be good fits? Or is it more like anyone who shows up?",
  "Yeah I think I get that. So like, when you're looking for people, what kinds of things do you look for? Like what made you decide I might be a good fit even though I'm nervous?",
  "That really helps to hear. Um, I'm wondering like, what if I have like an idea but I'm not sure if it's a good idea? Like, can I still like, talk about it without feeling stupid?",
  "Cool, that's good to know. So like, I'm thinking about getting involved but I want to make sure I understand like what the time commitment is. Like how much time would someone need to put in?",
  "Okay, so it's flexible based on like what you're doing. That makes sense. Um, I'm also wondering like, are there other people I could talk to who are already involved? Like people I could ask questions?",
  "Yeah, that would be really helpful actually. So like, when you first started this, did you have any moments where you were like, 'oh no, I don't know what I'm doing'? Or was it more planned out?",
  "Oh wow, so you figured it out as you went along. That's actually really reassuring because like, I feel like I'm always figuring things out as I go. Um, so like, what do you think is like the most important thing to understand before getting started?",
  "The autonomy thing is really important to me too. Um, so like, if I have a vision for something but the group wants to do it differently, what happens? Like who decides?",
  "Okay so it's like collaborative but like I have a say. That's good. Um, I'm thinking like, what if I fail at something? Like really fail, not just like small mistakes. Would that be like a problem?",
  "No that's helpful. So like, failure is part of it. That actually makes me feel better because I've failed at things before and like, I learned from it. Um, I guess now I'm wondering like, how soon could I get started? Like is there like a process or timeline?",
  "Okay so like soon but not like immediate. That makes sense. Um, I think I'm getting a clearer picture now. Like, I think I'm actually really interested. But um, I want to make sure I'm like thinking about this right. Like, what would be like the first step if I decided to do this?",
  "Okay, so like reaching out and talking more. That makes sense. Um, I feel like I've learned a lot in this conversation. Like you've answered my questions and like, you seem genuine about wanting people like me. Um, I think I'm like, actually going to do this. Like, I'm going to reach out.",
  "Yeah, I think so. Like, you explained things in a way that made sense to me. And like, I don't feel stupid for asking questions. That was really important to me. Um, I guess I'm just like, ready to take the next step, you know?",
  "For sure. Um, I'm excited but also like nervous, which I think is normal right? Like I feel like the nerves mean I care about it. Um, so yeah, I'm going to reach out and like, keep the conversation going.",
  "Yeah thanks so much for like, taking the time to explain everything. Like, I really appreciated it. Um, I think this was like, exactly what I needed to hear to feel confident about pursuing this. Like, you made it feel possible for someone like me.",
  "Okay, I think I'm ready. Like, I know what the next step is, I have like a better understanding of what I'm getting into, and like, I feel welcomed. So yeah, I'm going to go reach out. Thanks again!"
];

async function test() {
  const results = [];
  let messages = [];

  console.log('\n=== AUTHENTIC INARTICULATE: 20 TURN ENGAGEMENT TEST ===\n');

  for (let turn = 1; turn <= 20; turn++) {
    console.log(`Turn ${turn}:`);

    // Add user message
    messages.push({ role: 'user', content: authenticInarticulateUtterances[turn - 1] });

    // Get API response
    const response = await makeRequest(messages);

    const fit = response.fitScore;
    const auth = response.rubricScores?.authenticity;
    const act = response.dialogueAct;
    const responseText = response.response?.substring(0, 80) || '(no response)';

    console.log(`  Fit: ${fit} | Auth: ${auth} | Act: ${act}`);
    console.log(`  Response: "${responseText}..."`);
    console.log();

    results.push({
      turn,
      fit,
      auth,
      act,
      response: response.response
    });

    // Add assistant response to message history
    if (response.response) {
      messages.push({ role: 'assistant', content: response.response });
    }
  }

  console.log('\n=== 20-TURN TRAJECTORY ===\n');
  console.log('Turn | Fit | Auth | DialogueAct');
  console.log('-----|-----|------|--------------------');
  results.forEach(r => {
    console.log(`  ${r.turn.toString().padStart(2)} | ${(r.fit || '?').toString().padStart(3)} | ${(r.auth || '?').toString().padStart(3)} | ${(r.act || '?').padEnd(18)}`);
  });

  // Analyze trajectory
  const fitTrend = results.slice(-5).map(r => r.fit).reduce((a, b) => a + b, 0) / 5;
  const authTrend = results.slice(-5).map(r => r.auth).reduce((a, b) => a + b, 0) / 5;
  const actCounts = {};
  results.forEach(r => {
    actCounts[r.act] = (actCounts[r.act] || 0) + 1;
  });

  console.log('\n=== ANALYSIS ===\n');
  console.log('Fit Score Trajectory:');
  console.log(`  Turns 1-5:  ${results.slice(0, 5).map(r => r.fit).join(', ')}`);
  console.log(`  Turns 6-10: ${results.slice(5, 10).map(r => r.fit).join(', ')}`);
  console.log(`  Turns 11-15: ${results.slice(10, 15).map(r => r.fit).join(', ')}`);
  console.log(`  Turns 16-20: ${results.slice(15, 20).map(r => r.fit).join(', ')}`);
  console.log(`  Avg last 5 turns: ${fitTrend.toFixed(1)}`);

  console.log('\nAuthenticity Trajectory:');
  console.log(`  Turns 1-5:  ${results.slice(0, 5).map(r => r.auth).join(', ')}`);
  console.log(`  Turns 6-10: ${results.slice(5, 10).map(r => r.auth).join(', ')}`);
  console.log(`  Turns 11-15: ${results.slice(10, 15).map(r => r.auth).join(', ')}`);
  console.log(`  Turns 16-20: ${results.slice(15, 20).map(r => r.auth).join(', ')}`);
  console.log(`  Avg last 5 turns: ${authTrend.toFixed(1)}`);

  console.log('\nDialogue Act Distribution:');
  Object.entries(actCounts).forEach(([act, count]) => {
    console.log(`  ${act}: ${count} turns`);
  });

  // Check for natural exit point
  const lastAct = results[results.length - 1].act;
  const highFitEnd = results[results.length - 1].fit >= 75;

  console.log('\nConversation Arc:');
  if (highFitEnd && (lastAct === 'affirm_commitment' || lastAct === 'validate_genuine')) {
    console.log('✓ Natural exit point detected - person committed, high fit');
  } else if (results.length >= 15) {
    console.log('⚠ No clear exit detected - AI may need "conclude_conversation" dialogue act');
  }
}

test().catch(console.error);
