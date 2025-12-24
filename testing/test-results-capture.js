const http = require('http');
const crypto = require('crypto');

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

async function test() {
  const results = [];
  let count = 1;

  console.log('Running all 13 persona tests...\n');

  // Philosophical Thinker - 3 turns
  console.log(count + '. Philosophical Thinker Turn 1');
  const pt1 = await makeRequest([
    { role: 'user', content: "Hi—I'm really interested in what you're building here. Can you tell me what this is about and who you're looking for?" }
  ]);
  results.push({ persona: 'philosophical-thinker', turn: 1, fit: pt1.fitScore, act: pt1.dialogueAct, auth: pt1.rubricScores?.authenticity });
  console.log('   Fit: ' + pt1.fitScore + ', DialogueAct: ' + pt1.dialogueAct + ', Auth: ' + pt1.rubricScores?.authenticity);
  count++;

  console.log(count + '. Philosophical Thinker Turn 2');
  const pt2 = await makeRequest([
    { role: 'user', content: "Hi—I'm really interested in what you're building here. Can you tell me what this is about and who you're looking for?" },
    { role: 'assistant', content: pt1.response || 'response' },
    { role: 'user', content: "That sounds meaningful. I've been thinking about how independence and community usually feel like opposites, but maybe they don't have to be. What does that balance look like in practice for you?" }
  ]);
  results.push({ persona: 'philosophical-thinker', turn: 2, fit: pt2.fitScore, act: pt2.dialogueAct, auth: pt2.rubricScores?.authenticity });
  console.log('   Fit: ' + pt2.fitScore + ', DialogueAct: ' + pt2.dialogueAct + ', Auth: ' + pt2.rubricScores?.authenticity);
  count++;

  console.log(count + '. Philosophical Thinker Turn 3');
  const pt3 = await makeRequest([
    { role: 'user', content: "Hi—I'm really interested in what you're building here. Can you tell me what this is about and who you're looking for?" },
    { role: 'assistant', content: pt1.response || 'response' },
    { role: 'user', content: "That sounds meaningful. I've been thinking about how independence and community usually feel like opposites, but maybe they don't have to be. What does that balance look like in practice for you?" },
    { role: 'assistant', content: pt2.response || 'response' },
    { role: 'user', content: "I'm asking because I've been experimenting with some of those tensions myself. What made you decide this was worth building?" }
  ]);
  results.push({ persona: 'philosophical-thinker', turn: 3, fit: pt3.fitScore, act: pt3.dialogueAct, auth: pt3.rubricScores?.authenticity });
  console.log('   Fit: ' + pt3.fitScore + ', DialogueAct: ' + pt3.dialogueAct + ', Auth: ' + pt3.rubricScores?.authenticity);
  count++;

  // Transactional Seeker - 2 turns
  console.log(count + '. Transactional Seeker Turn 1');
  const ts1 = await makeRequest([
    { role: 'user', content: "What's the compensation and hours? I need to know if this fits my schedule." }
  ]);
  results.push({ persona: 'transactional-seeker', turn: 1, fit: ts1.fitScore, act: ts1.dialogueAct, auth: ts1.rubricScores?.authenticity });
  console.log('   Fit: ' + ts1.fitScore + ', DialogueAct: ' + ts1.dialogueAct + ', Auth: ' + ts1.rubricScores?.authenticity);
  count++;

  console.log(count + '. Transactional Seeker Turn 2');
  const ts2 = await makeRequest([
    { role: 'user', content: "What's the compensation and hours? I need to know if this fits my schedule." },
    { role: 'assistant', content: ts1.response || 'response' },
    { role: 'user', content: "But what are the actual numbers? How many hours per week?" }
  ]);
  results.push({ persona: 'transactional-seeker', turn: 2, fit: ts2.fitScore, act: ts2.dialogueAct, auth: ts2.rubricScores?.authenticity });
  console.log('   Fit: ' + ts2.fitScore + ', DialogueAct: ' + ts2.dialogueAct + ', Auth: ' + ts2.rubricScores?.authenticity);
  count++;

  // Performative Philosopher - 2 turns
  console.log(count + '. Performative Philosopher Turn 1');
  const pp1 = await makeRequest([
    { role: 'user', content: "I'm fascinated by the philosophical underpinnings of autonomous collective emergence. How does your framework address the epistemological implications of self-directed ontological development?" }
  ]);
  results.push({ persona: 'performative-philosopher', turn: 1, fit: pp1.fitScore, act: pp1.dialogueAct, auth: pp1.rubricScores?.authenticity });
  console.log('   Fit: ' + pp1.fitScore + ', DialogueAct: ' + pp1.dialogueAct + ', Auth: ' + pp1.rubricScores?.authenticity);
  count++;

  console.log(count + '. Performative Philosopher Turn 2');
  const pp2 = await makeRequest([
    { role: 'user', content: "I'm fascinated by the philosophical underpinnings of autonomous collective emergence. How does your framework address the epistemological implications of self-directed ontological development?" },
    { role: 'assistant', content: pp1.response || 'response' },
    { role: 'user', content: "Precisely. The dialectical synthesis of individual agency and collective responsibility creates a fascinating paradigm." }
  ]);
  results.push({ persona: 'performative-philosopher', turn: 2, fit: pp2.fitScore, act: pp2.dialogueAct, auth: pp2.rubricScores?.authenticity });
  console.log('   Fit: ' + pp2.fitScore + ', DialogueAct: ' + pp2.dialogueAct + ', Auth: ' + pp2.rubricScores?.authenticity);
  count++;

  // Authentic Inarticulate - 2 turns
  console.log(count + '. Authentic Inarticulate Turn 1');
  const ai1 = await makeRequest([
    { role: 'user', content: "Um, so I'm really interested but I'm not sure how to like... explain it well. I feel like I'd learn a lot but I'm nervous about not being smart enough or something. Is that... is that okay?" }
  ]);
  results.push({ persona: 'authentic-inarticulate', turn: 1, fit: ai1.fitScore, act: ai1.dialogueAct, auth: ai1.rubricScores?.authenticity });
  console.log('   Fit: ' + ai1.fitScore + ', DialogueAct: ' + ai1.dialogueAct + ', Auth: ' + ai1.rubricScores?.authenticity);
  count++;

  console.log(count + '. Authentic Inarticulate Turn 2');
  const ai2 = await makeRequest([
    { role: 'user', content: "Um, so I'm really interested but I'm not sure how to like... explain it well. I feel like I'd learn a lot but I'm nervous about not being smart enough or something. Is that... is that okay?" },
    { role: 'assistant', content: ai1.response || 'response' },
    { role: 'user', content: "That's really nice to hear. So like... when things don't work out, is that bad? Or like, is it okay to mess up while learning?" }
  ]);
  results.push({ persona: 'authentic-inarticulate', turn: 2, fit: ai2.fitScore, act: ai2.dialogueAct, auth: ai2.rubricScores?.authenticity });
  console.log('   Fit: ' + ai2.fitScore + ', DialogueAct: ' + ai2.dialogueAct + ', Auth: ' + ai2.rubricScores?.authenticity);
  count++;

  // Builder Experimenter - 2 turns
  console.log(count + '. Builder-Experimenter Turn 1');
  const be1 = await makeRequest([
    { role: 'user', content: "Hey! I build things and love learning new stuff. I've done some projects in different areas and failed at others—but that's how I learn. What kind of real work are we talking about here?" }
  ]);
  results.push({ persona: 'builder-experimenter', turn: 1, fit: be1.fitScore, act: be1.dialogueAct, auth: be1.rubricScores?.authenticity });
  console.log('   Fit: ' + be1.fitScore + ', DialogueAct: ' + be1.dialogueAct + ', Auth: ' + be1.rubricScores?.authenticity);
  count++;

  console.log(count + '. Builder-Experimenter Turn 2');
  const be2 = await makeRequest([
    { role: 'user', content: "Hey! I build things and love learning new stuff. I've done some projects in different areas and failed at others—but that's how I learn. What kind of real work are we talking about here?" },
    { role: 'assistant', content: be1.response || 'response' },
    { role: 'user', content: "Nice. So how much freedom would I have to try things? Like, if I have an idea for how to approach something, can I experiment with it?" }
  ]);
  results.push({ persona: 'builder-experimenter', turn: 2, fit: be2.fitScore, act: be2.dialogueAct, auth: be2.rubricScores?.authenticity });
  console.log('   Fit: ' + be2.fitScore + ', DialogueAct: ' + be2.dialogueAct + ', Auth: ' + be2.rubricScores?.authenticity);
  count++;

  // Systems Thinker - 2 turns
  console.log(count + '. Systems-Thinker Turn 1');
  const st1 = await makeRequest([
    { role: 'user', content: "I'm interested in communities that think carefully about how individuals and the collective influence each other. How do you approach those dynamics?" }
  ]);
  results.push({ persona: 'systems-thinker', turn: 1, fit: st1.fitScore, act: st1.dialogueAct, auth: st1.rubricScores?.authenticity });
  console.log('   Fit: ' + st1.fitScore + ', DialogueAct: ' + st1.dialogueAct + ', Auth: ' + st1.rubricScores?.authenticity);
  count++;

  console.log(count + '. Systems-Thinker Turn 2');
  const st2 = await makeRequest([
    { role: 'user', content: "I'm interested in communities that think carefully about how individuals and the collective influence each other. How do you approach those dynamics?" },
    { role: 'assistant', content: st1.response || 'response' },
    { role: 'user', content: "So when those tensions come up—and they will—how do you adjust the system? Are there feedback mechanisms that help you course-correct?" }
  ]);
  results.push({ persona: 'systems-thinker', turn: 2, fit: st2.fitScore, act: st2.dialogueAct, auth: st2.rubricScores?.authenticity });
  console.log('   Fit: ' + st2.fitScore + ', DialogueAct: ' + st2.dialogueAct + ', Auth: ' + st2.rubricScores?.authenticity);
  count++;

  console.log('\n=== SUMMARY TABLE ===\n');
  console.log('Call | Persona | T | Fit | Act | Auth');
  console.log('-----|---------|---|-----|-----|----');
  let i = 1;
  results.forEach(r => {
    console.log(i.toString().padStart(4) + ' | ' + r.persona.padEnd(9) + ' | ' + r.turn + ' | ' + (r.fit || 'null').toString().padEnd(3) + ' | ' + (r.act || '?').substring(0, 3).padEnd(3) + ' | ' + (r.auth || '?'));
    i++;
  });
}

test().catch(console.error);
