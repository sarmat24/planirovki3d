import { env } from './env';

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType || 'audio/ogg' });
  formData.append('file', blob, 'audio.ogg');
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'ru');
  formData.append('response_format', 'text');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq Whisper error: ${err}`);
  }

  return res.text();
}
