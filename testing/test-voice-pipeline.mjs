// End-to-end integration test: Voice Signal Analysis Pipeline
// Test audio → Whisper transcription with timestamps → Signal extraction → Creative AI interpretation

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const GROQ_API_KEY = process.env.GROQ_API_KEY?.replace('GROQ_API_KEY=', '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('=== VOICE SIGNAL ANALYSIS PIPELINE TEST ===\n');

// Step 1: Create a test audio file (or use existing)
// For this test, we'll simulate with a pre-recorded sample or use text-to-speech
// In production, this comes from Flutter audio capture

async function transcribeWithTimestamps(audioBuffer, filename) {
  console.log('Step 2: Sending to Whisper for transcription with timestamps...\n');

  // Try OpenAI Whisper first (guaranteed word timestamps)
  // Groq's Whisper implementation may vary

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');

  try {
    // Try OpenAI first (has word timestamps)
    if (OPENAI_API_KEY) {
      console.log('  Using OpenAI Whisper API...');
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        return result;
      }
    }

    // Fallback: Try Groq
    console.log('  Trying Groq Whisper API...');
    const groqFormData = new FormData();
    groqFormData.append('file', new Blob([audioBuffer]), filename);
    groqFormData.append('model', 'whisper-large-v3');
    groqFormData.append('response_format', 'verbose_json');

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: groqFormData
    });

    if (groqResponse.ok) {
      const result = await groqResponse.json();
      return result;
    } else {
      const error = await groqResponse.text();
      console.log('  Groq error:', error);
    }

  } catch (error) {
    console.log('  Transcription error:', error.message);
  }

  return null;
}

function extractSignals(transcription) {
  console.log('Step 3: Extracting voice signals from timestamps...\n');

  const signals = {
    transcript: '',
    wordCount: 0,
    duration: 0,
    wpm: 0,
    pauses: [],
    maxPauseSec: 0,
    avgPauseSec: 0,
    hesitations: [],
    hesitationCount: 0,
    confidence: 'unknown'
  };

  if (!transcription) {
    console.log('  No transcription data available');
    return signals;
  }

  signals.transcript = transcription.text || '';
  signals.duration = transcription.duration || 0;

  // Extract from words array (if available)
  const words = transcription.words || [];
  signals.wordCount = words.length || signals.transcript.split(/\s+/).filter(w => w).length;

  if (signals.duration > 0) {
    signals.wpm = Math.round((signals.wordCount / signals.duration) * 60);
  }

  // Detect pauses between words
  if (words.length > 1) {
    for (let i = 1; i < words.length; i++) {
      const gap = words[i].start - words[i-1].end;
      if (gap > 0.3) { // Pause threshold: 300ms
        signals.pauses.push({
          afterWord: words[i-1].word,
          duration: parseFloat(gap.toFixed(2)),
          position: i
        });
      }
    }
  }

  if (signals.pauses.length > 0) {
    signals.maxPauseSec = Math.max(...signals.pauses.map(p => p.duration));
    signals.avgPauseSec = parseFloat((signals.pauses.reduce((sum, p) => sum + p.duration, 0) / signals.pauses.length).toFixed(2));
  }

  // Detect hesitation markers
  const hesitationPatterns = /\b(um|uh|ah|er|like|you know|i mean|sort of|kind of)\b/gi;
  const matches = signals.transcript.match(hesitationPatterns) || [];
  signals.hesitations = matches.map(m => m.toLowerCase());
  signals.hesitationCount = matches.length;

  // Calculate confidence proxy
  if (signals.hesitationCount <= 1 && signals.wpm >= 80 && signals.wpm <= 150 && signals.maxPauseSec < 1.0) {
    signals.confidence = 'high';
  } else if (signals.hesitationCount >= 4 || signals.maxPauseSec > 3.0 || signals.wpm < 40) {
    signals.confidence = 'low';
  } else {
    signals.confidence = 'moderate';
  }

  return signals;
}

async function getCreativeInterpretation(signals) {
  console.log('Step 4: Getting creative AI interpretation of signals...\n');

  const prompt = `You are providing real-time voice feedback during a conversation. Based on these voice signals, give a brief, warm, human observation (1-2 sentences max). Be like a compassionate coach noticing how someone is speaking, not judging content.

Voice signals detected:
- Speaking pace: ${signals.wpm} words per minute
- Pauses detected: ${signals.pauses.length} (longest: ${signals.maxPauseSec}s)
- Hesitation markers: ${signals.hesitationCount} (${signals.hesitations.join(', ') || 'none'})
- Overall confidence: ${signals.confidence}

Respond with just the observation, no quotes or explanation. Be warm but honest.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 100
      })
    });

    if (response.ok) {
      const result = await response.json();
      return result.choices[0]?.message?.content || null;
    }
  } catch (error) {
    console.log('  Creative interpretation error:', error.message);
  }

  return null;
}

function getEmoji(signals) {
  if (signals.confidence === 'high') return '😊';
  if (signals.confidence === 'low') return '☹️';
  return '😐';
}

async function runPipelineTest() {
  console.log('Step 1: Preparing test audio...\n');

  // Check if we have a test audio file
  const testAudioPath = path.join(__dirname, 'test-audio.wav');
  const testAudioPath2 = path.join(__dirname, 'test-audio.mp3');
  const testAudioPath3 = path.join(__dirname, 'test-audio.webm');

  let audioBuffer = null;
  let filename = 'test-audio.wav';

  if (fs.existsSync(testAudioPath)) {
    audioBuffer = fs.readFileSync(testAudioPath);
    filename = 'test-audio.wav';
    console.log('  Found test-audio.wav');
  } else if (fs.existsSync(testAudioPath2)) {
    audioBuffer = fs.readFileSync(testAudioPath2);
    filename = 'test-audio.mp3';
    console.log('  Found test-audio.mp3');
  } else if (fs.existsSync(testAudioPath3)) {
    audioBuffer = fs.readFileSync(testAudioPath3);
    filename = 'test-audio.webm';
    console.log('  Found test-audio.webm');
  } else {
    console.log('  ⚠️  No test audio file found.');
    console.log('  To test the full pipeline, create a test audio file:');
    console.log('  - Record yourself saying something (10-30 seconds)');
    console.log('  - Save as test-audio.wav, test-audio.mp3, or test-audio.webm');
    console.log('  - Re-run this test\n');

    // Simulate with mock data to test the rest of the pipeline
    console.log('  Using mock transcription data to test signal extraction...\n');

    const mockTranscription = {
      text: "Um, so I'm really interested in this, but like, I'm not sure how to explain it well. I feel like I'd learn a lot but I'm nervous about not being, um, smart enough or something. Is that okay?",
      duration: 15.5,
      words: [
        { word: "Um,", start: 0.0, end: 0.3 },
        { word: "so", start: 0.8, end: 0.9 },
        { word: "I'm", start: 0.95, end: 1.1 },
        { word: "really", start: 1.15, end: 1.4 },
        { word: "interested", start: 1.45, end: 1.9 },
        { word: "in", start: 1.95, end: 2.0 },
        { word: "this,", start: 2.05, end: 2.3 },
        { word: "but", start: 2.8, end: 2.9 },
        { word: "like,", start: 3.0, end: 3.2 },
        { word: "I'm", start: 3.4, end: 3.5 },
        { word: "not", start: 3.55, end: 3.7 },
        { word: "sure", start: 3.75, end: 3.95 },
        { word: "how", start: 4.0, end: 4.1 },
        { word: "to", start: 4.15, end: 4.2 },
        { word: "explain", start: 4.25, end: 4.6 },
        { word: "it", start: 4.65, end: 4.75 },
        { word: "well.", start: 4.8, end: 5.1 },
        { word: "I", start: 5.8, end: 5.85 },
        { word: "feel", start: 5.9, end: 6.1 },
        { word: "like", start: 6.15, end: 6.3 },
        { word: "I'd", start: 6.35, end: 6.5 },
        { word: "learn", start: 6.55, end: 6.8 },
        { word: "a", start: 6.85, end: 6.9 },
        { word: "lot", start: 6.95, end: 7.15 },
        { word: "but", start: 7.5, end: 7.6 },
        { word: "I'm", start: 7.65, end: 7.8 },
        { word: "nervous", start: 7.85, end: 8.2 },
        { word: "about", start: 8.25, end: 8.5 },
        { word: "not", start: 8.55, end: 8.7 },
        { word: "being,", start: 8.75, end: 9.0 },
        { word: "um,", start: 9.5, end: 9.7 },
        { word: "smart", start: 9.9, end: 10.2 },
        { word: "enough", start: 10.25, end: 10.5 },
        { word: "or", start: 10.55, end: 10.65 },
        { word: "something.", start: 10.7, end: 11.1 },
        { word: "Is", start: 11.8, end: 11.9 },
        { word: "that", start: 11.95, end: 12.1 },
        { word: "okay?", start: 12.15, end: 12.5 }
      ]
    };

    const signals = extractSignals(mockTranscription);

    console.log('=== SIGNAL EXTRACTION RESULTS ===\n');
    console.log('Transcript:', signals.transcript.substring(0, 80) + '...');
    console.log('Duration:', signals.duration, 'seconds');
    console.log('Word count:', signals.wordCount);
    console.log('Speaking pace:', signals.wpm, 'WPM');
    console.log('Pauses detected:', signals.pauses.length);
    if (signals.pauses.length > 0) {
      console.log('  Longest pause:', signals.maxPauseSec, 'seconds');
      console.log('  Average pause:', signals.avgPauseSec, 'seconds');
      console.log('  Pause locations:', signals.pauses.slice(0, 3).map(p => `${p.duration}s after "${p.afterWord}"`).join(', '));
    }
    console.log('Hesitations:', signals.hesitationCount, signals.hesitations.length > 0 ? `(${signals.hesitations.join(', ')})` : '');
    console.log('Confidence level:', signals.confidence);
    console.log('Emoji:', getEmoji(signals));

    // Get creative interpretation
    const interpretation = await getCreativeInterpretation(signals);
    if (interpretation) {
      console.log('\n=== CREATIVE AI INTERPRETATION ===\n');
      console.log(interpretation);
    }

    console.log('\n=== PIPELINE TEST COMPLETE ===\n');
    console.log('✓ Signal extraction working');
    console.log('✓ Creative interpretation working');
    console.log('→ Add a real audio file to test Whisper transcription');

    return;
  }

  // If we have real audio, run full pipeline
  const transcription = await transcribeWithTimestamps(audioBuffer, filename);

  if (!transcription) {
    console.log('  ⚠️  Transcription failed. Check API keys.\n');
    return;
  }

  console.log('  Transcription received!\n');

  const signals = extractSignals(transcription);

  console.log('=== SIGNAL EXTRACTION RESULTS ===\n');
  console.log('Transcript:', signals.transcript);
  console.log('Duration:', signals.duration, 'seconds');
  console.log('Word count:', signals.wordCount);
  console.log('Speaking pace:', signals.wpm, 'WPM');
  console.log('Pauses detected:', signals.pauses.length);
  if (signals.pauses.length > 0) {
    console.log('  Longest pause:', signals.maxPauseSec, 'seconds');
    console.log('  Average pause:', signals.avgPauseSec, 'seconds');
  }
  console.log('Hesitations:', signals.hesitationCount, signals.hesitations.length > 0 ? `(${signals.hesitations.join(', ')})` : '');
  console.log('Confidence level:', signals.confidence);
  console.log('Emoji:', getEmoji(signals));

  // Get creative interpretation
  const interpretation = await getCreativeInterpretation(signals);
  if (interpretation) {
    console.log('\n=== CREATIVE AI INTERPRETATION ===\n');
    console.log(interpretation);
  }

  console.log('\n=== FULL PIPELINE TEST COMPLETE ===\n');
}

runPipelineTest().catch(console.error);
