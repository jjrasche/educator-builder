// Voice Signal Analysis API
// Audio → Whisper STT → Signal extraction (JS math, no LLM)
// Vibe interpretation happens in chat.js (single LLM call)

import OpenAI from 'openai';
import { Readable } from 'stream';

// MOCK_MODE: For E2E testing without external API calls
// Mocks Whisper and Groq. Signal extraction runs for real.
// Can be enabled via env var OR X-Mock-Mode header for testing.
function isMockMode(req) {
  return process.env.MOCK_MODE === 'true' || req?.headers?.['x-mock-mode'] === 'true';
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb' // Allow larger audio chunks
    }
  }
};

// Mock transcription data for testing
const MOCK_TRANSCRIPTIONS = {
  confident: {
    text: "I've been thinking about this a lot. I want to build things that matter, with people who care about craft. I'm not looking for just any job—I want to be part of something real.",
    duration: 8.5,
    words: [
      { word: "I've", start: 0.0, end: 0.2 },
      { word: "been", start: 0.25, end: 0.4 },
      { word: "thinking", start: 0.45, end: 0.8 },
      { word: "about", start: 0.85, end: 1.0 },
      { word: "this", start: 1.05, end: 1.2 },
      { word: "a", start: 1.25, end: 1.3 },
      { word: "lot.", start: 1.35, end: 1.6 },
      { word: "I", start: 1.9, end: 2.0 },
      { word: "want", start: 2.05, end: 2.2 },
      { word: "to", start: 2.25, end: 2.3 },
      { word: "build", start: 2.35, end: 2.6 },
      { word: "things", start: 2.65, end: 2.9 },
      { word: "that", start: 2.95, end: 3.1 },
      { word: "matter,", start: 3.15, end: 3.5 },
      { word: "with", start: 3.6, end: 3.75 },
      { word: "people", start: 3.8, end: 4.1 },
      { word: "who", start: 4.15, end: 4.3 },
      { word: "care", start: 4.35, end: 4.6 },
      { word: "about", start: 4.65, end: 4.85 },
      { word: "craft.", start: 4.9, end: 5.3 },
      { word: "I'm", start: 5.6, end: 5.75 },
      { word: "not", start: 5.8, end: 5.95 },
      { word: "looking", start: 6.0, end: 6.3 },
      { word: "for", start: 6.35, end: 6.5 },
      { word: "just", start: 6.55, end: 6.75 },
      { word: "any", start: 6.8, end: 6.95 },
      { word: "job—I", start: 7.0, end: 7.3 },
      { word: "want", start: 7.35, end: 7.5 },
      { word: "to", start: 7.55, end: 7.65 },
      { word: "be", start: 7.7, end: 7.8 },
      { word: "part", start: 7.85, end: 8.0 },
      { word: "of", start: 8.05, end: 8.15 },
      { word: "something", start: 8.2, end: 8.4 },
      { word: "real.", start: 8.45, end: 8.7 }
    ]
  },
  hesitant: {
    text: "Um, so I'm really interested in this, but like, I'm not sure how to explain it well. I feel like I'd learn a lot but I'm nervous about not being, um, smart enough.",
    duration: 12.5,
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
      { word: "enough.", start: 10.25, end: 10.6 }
    ]
  }
};

// Select mock scenario based on audio size (larger = more content = hesitant for testing variety)
function getMockScenario(audioSize) {
  return audioSize > 5000 ? 'hesitant' : 'confident';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audio, format = 'webm', sessionId } = req.body;

  if (!audio) {
    return res.status(400).json({ error: 'No audio provided' });
  }

  try {
    // 1. Decode audio from base64
    const audioBuffer = Buffer.from(audio, 'base64');
    const extension = format.replace('audio/', '').split(';')[0] || 'webm';
    const filename = `audio.${extension}`;
    const mimeType = format.includes('/') ? format : `audio/${format}`;

    // 2. Transcribe with Whisper (or mock in test mode)
    let transcription;
    if (isMockMode(req)) {
      const scenario = getMockScenario(audioBuffer.length);
      transcription = MOCK_TRANSCRIPTIONS[scenario];
      console.log(`[MOCK] Using mock transcription: ${scenario}`);
    } else {
      transcription = await transcribeAudio(audioBuffer, filename, mimeType);
    }

    if (!transcription) {
      return res.status(500).json({ error: 'Transcription failed' });
    }

    // 3. Extract voice signals from timestamps
    const signals = extractSignals(transcription);

    // 4. Return transcript + signals (vibe comes from chat.js now - single LLM call)
    return res.status(200).json({
      success: true,
      transcript: signals.transcript,
      signals: {
        // Timing
        wpm: signals.wpm,
        duration: signals.duration,
        wordCount: signals.wordCount,
        paceCategory: signals.paceCategory,      // slow / measured / fast
        flowCategory: signals.flowCategory,       // continuous / choppy / natural
        // Pauses
        pauses: {
          count: signals.pauses.length,
          maxSec: signals.maxPauseSec,
          avgSec: signals.avgPauseSec,
          locations: signals.pauses.slice(0, 5)
        },
        // Hesitations / fillers
        hesitations: {
          count: signals.hesitationCount,
          markers: signals.hesitations,
          density: signals.fillerDensity          // per 100 words
        },
        // Quality signals from Whisper segments
        clarity: signals.clarity,                  // clear / moderate / unclear
        speechPattern: signals.speechPattern,      // normal / varied / repetitive
        silenceRatio: signals.silenceRatio,        // 0.0-1.0
        segmentMetrics: signals.segmentMetrics     // raw avgLogprob, avgCompressionRatio, avgNoSpeechProb
      },
      sessionId
    });

  } catch (error) {
    console.error('Voice analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function transcribeAudio(audioBuffer, filename, mimeType = 'audio/webm') {
  const groqKey = process.env.GROQ_API_KEY?.replace('GROQ_API_KEY=', '');
  const openaiKey = process.env.OPENAI_API_KEY;

  // Create form data for upload
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');

  // Try Groq first (faster, included in existing API)
  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`
      },
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      // Groq returns segments, we need to extract word-level timing
      return normalizeTranscription(result, 'groq');
    }
  } catch (e) {
    console.log('Groq transcription failed, trying OpenAI:', e.message);
  }

  // Fallback to OpenAI (guaranteed word timestamps)
  if (openaiKey) {
    try {
      const openaiFormData = new FormData();
      openaiFormData.append('file', new Blob([audioBuffer]), filename);
      openaiFormData.append('model', 'whisper-1');
      openaiFormData.append('response_format', 'verbose_json');
      openaiFormData.append('timestamp_granularities[]', 'word');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`
        },
        body: openaiFormData
      });

      if (response.ok) {
        const result = await response.json();
        return normalizeTranscription(result, 'openai');
      }
    } catch (e) {
      console.log('OpenAI transcription failed:', e.message);
    }
  }

  return null;
}

function normalizeTranscription(result, source) {
  // Normalize different API response formats to consistent structure
  const normalized = {
    text: result.text || '',
    duration: result.duration || 0,
    language: result.language || null,
    words: [],
    segments: [] // Keep segment metadata for quality signals
  };

  if (source === 'openai' && result.words) {
    // OpenAI returns word-level timestamps directly
    normalized.words = result.words;
  }

  if (result.segments) {
    // Extract segment metadata (quality indicators)
    result.segments.forEach(segment => {
      normalized.segments.push({
        start: segment.start,
        end: segment.end,
        text: segment.text,
        avgLogprob: segment.avg_logprob,        // Transcription confidence (-0.1 = high, -1.0 = low)
        noSpeechProb: segment.no_speech_prob,   // Silence probability (0.0 = speech, 1.0 = silence)
        compressionRatio: segment.compression_ratio  // Speech pattern (1.0-2.0 = normal)
      });

      // If no word-level timestamps, estimate from segment timing
      if (normalized.words.length === 0) {
        const segmentWords = segment.text.trim().split(/\s+/);
        const segmentDuration = segment.end - segment.start;
        const wordDuration = segmentDuration / segmentWords.length;

        segmentWords.forEach((word, i) => {
          normalized.words.push({
            word: word,
            start: segment.start + (i * wordDuration),
            end: segment.start + ((i + 1) * wordDuration)
          });
        });
      }
    });
  }

  return normalized;
}

function extractSignals(transcription) {
  const signals = {
    transcript: transcription.text || '',
    language: transcription.language || null,
    wordCount: 0,
    duration: transcription.duration || 0,
    wpm: 0,
    // Timing signals
    pauses: [],
    maxPauseSec: 0,
    avgPauseSec: 0,
    // Content signals
    hesitations: [],
    hesitationCount: 0,
    // Quality signals from segments
    clarity: null,        // From avg_logprob: clear / muffled / unclear
    silenceRatio: null,   // From no_speech_prob: how much silence
    speechPattern: null,  // From compression_ratio: normal / repetitive / varied
    // Raw segment data for LLM interpretation
    segmentMetrics: null
  };

  const words = transcription.words || [];
  const segments = transcription.segments || [];

  signals.wordCount = words.length || signals.transcript.split(/\s+/).filter(w => w).length;

  if (signals.duration > 0) {
    signals.wpm = Math.round((signals.wordCount / signals.duration) * 60);
  }

  // Extract quality metrics from segments
  if (segments.length > 0) {
    const logprobs = segments.map(s => s.avgLogprob).filter(v => v !== undefined && v !== null);
    const noSpeechProbs = segments.map(s => s.noSpeechProb).filter(v => v !== undefined && v !== null);
    const compressionRatios = segments.map(s => s.compressionRatio).filter(v => v !== undefined && v !== null);

    if (logprobs.length > 0) {
      const avgLogprob = logprobs.reduce((a, b) => a + b, 0) / logprobs.length;
      // avg_logprob: -0.1 = very clear, -0.5 = okay, -1.0+ = unclear
      signals.clarity = avgLogprob > -0.3 ? 'clear' : avgLogprob > -0.6 ? 'moderate' : 'unclear';
      signals.segmentMetrics = signals.segmentMetrics || {};
      signals.segmentMetrics.avgLogprob = parseFloat(avgLogprob.toFixed(3));
    }

    if (noSpeechProbs.length > 0) {
      const avgNoSpeech = noSpeechProbs.reduce((a, b) => a + b, 0) / noSpeechProbs.length;
      signals.silenceRatio = parseFloat(avgNoSpeech.toFixed(3));
      signals.segmentMetrics = signals.segmentMetrics || {};
      signals.segmentMetrics.avgNoSpeechProb = signals.silenceRatio;
    }

    if (compressionRatios.length > 0) {
      const avgCompression = compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length;
      // compression_ratio: 1.0-2.0 = normal, <1.0 = very varied, >2.5 = repetitive
      signals.speechPattern = avgCompression < 1.2 ? 'varied' : avgCompression > 2.2 ? 'repetitive' : 'normal';
      signals.segmentMetrics = signals.segmentMetrics || {};
      signals.segmentMetrics.avgCompressionRatio = parseFloat(avgCompression.toFixed(2));
    }
  }

  // Detect pauses between words
  if (words.length > 1) {
    for (let i = 1; i < words.length; i++) {
      const gap = words[i].start - words[i - 1].end;
      if (gap > 0.3) { // Pause threshold: 300ms
        signals.pauses.push({
          afterWord: words[i - 1].word,
          duration: parseFloat(gap.toFixed(2)),
          position: i
        });
      }
    }
  }

  if (signals.pauses.length > 0) {
    signals.maxPauseSec = Math.max(...signals.pauses.map(p => p.duration));
    signals.avgPauseSec = parseFloat(
      (signals.pauses.reduce((sum, p) => sum + p.duration, 0) / signals.pauses.length).toFixed(2)
    );
  }

  // Detect hesitation markers
  const hesitationPatterns = /\b(um|uh|ah|er|like|you know|i mean|sort of|kind of)\b/gi;
  const matches = signals.transcript.match(hesitationPatterns) || [];
  signals.hesitations = matches.map(m => m.toLowerCase());
  signals.hesitationCount = matches.length;

  // Compute filler density (hesitations per 100 words)
  signals.fillerDensity = signals.wordCount > 0
    ? parseFloat((signals.hesitationCount / signals.wordCount * 100).toFixed(1))
    : 0;

  // Pace category
  if (signals.wpm > 0) {
    signals.paceCategory = signals.wpm < 100 ? 'slow' : signals.wpm > 160 ? 'fast' : 'measured';
  }

  // Flow category (based on pauses)
  if (signals.pauses.length === 0) {
    signals.flowCategory = 'continuous';
  } else if (signals.maxPauseSec > 2.0 || signals.pauses.length > signals.wordCount / 10) {
    signals.flowCategory = 'choppy';
  } else {
    signals.flowCategory = 'natural';
  }

  return signals;
}

// Note: Vibe interpretation moved to chat.js (single LLM call handles response + evaluation + vibe)
