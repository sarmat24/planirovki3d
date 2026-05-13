import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { transcribeAudio } from '../lib/transcribe';
import { extractTasks } from '../lib/llm';
import { saveTasks } from '../lib/db';
import { getToday } from '../lib/format';
import { env } from '../lib/env';

function validateInitData(initData: string): number | null {
  try {
    const pairs = initData.split('&');
    const hashEntry = pairs.find(p => p.startsWith('hash='));
    if (!hashEntry) return null;
    const hash = hashEntry.slice(5);
    const dataCheckString = pairs.filter(p => !p.startsWith('hash=')).sort().join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(env.TELEGRAM_TOKEN).digest();
    const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (expected !== hash) return null;
    const userEntry = pairs.find(p => p.startsWith('user='));
    if (!userEntry) return null;
    const user = JSON.parse(decodeURIComponent(userEntry.slice(5))) as { id?: number };
    return typeof user.id === 'number' ? user.id : null;
  } catch { return null; }
}

function getUserId(req: VercelRequest): number | null {
  const initData = req.headers['x-telegram-init-data'] as string | undefined;
  if (initData) { const id = validateInitData(initData); if (id) return id; }
  const uid = Number(req.query.uid);
  return !isNaN(uid) && uid > 0 ? uid : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const { audio_base64, mime_type, day } = req.body as { audio_base64: string; mime_type?: string; day?: string };
    if (!audio_base64) { res.status(400).json({ error: 'No audio' }); return; }

    const audioBuffer = Buffer.from(audio_base64, 'base64');
    const transcribed = await transcribeAudio(audioBuffer, mime_type || 'audio/webm');

    const today = getToday();
    const tasks = await extractTasks(transcribed.trim(), today);
    if (tasks.length > 0) await saveTasks(userId, tasks, day || today);

    res.status(200).json({ transcribed: transcribed.trim(), added: tasks.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('voice error:', msg);
    res.status(500).json({ error: msg });
  }
}
