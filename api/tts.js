// OpenAI Text-to-Speech API
// Converts text to natural-sounding speech using OpenAI's TTS models

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};

// MOCK_MODE: For E2E testing without external API calls
function isMockMode(req) {
  return process.env.MOCK_MODE === 'true' || req?.headers?.['x-mock-mode'] === 'true';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, voice = 'nova' } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'No text provided' });
  }

  // Limit text length to control costs (OpenAI max is 4096 chars)
  const trimmedText = text.slice(0, 4096);

  try {
    if (isMockMode(req)) {
      // Return a tiny silent audio file for testing
      console.log('[MOCK] Returning silent audio for TTS');
      const silentMp3 = Buffer.from(
        'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNBrZ+AAAAAAAAAAAAAAAAAAAAAP/7UGQAD/AAADSAAAAAAgAAA0gAAAAAExBMQAAATEEwAAA',
        'base64'
      );
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', silentMp3.length);
      return res.send(silentMp3);
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',  // Use 'tts-1-hd' for higher quality (2x cost)
        input: trimmedText,
        voice: voice,    // alloy, echo, fable, onyx, nova, shimmer
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI TTS error:', error);
      throw new Error(`OpenAI TTS failed: ${response.status}`);
    }

    // Stream the audio response back to client
    const audioBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: error.message });
  }
}
