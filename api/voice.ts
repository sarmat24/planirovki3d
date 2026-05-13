import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { transcribeAudio } from '../lib/transcribe';
import { parseIntent } from '../lib/llm';
import { saveTasks, updateTask, deleteTask } from '../lib/db';
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
    const { audio_base64, mime_type, day, context_tasks } = req.body as {
      audio_base64: string;
      mime_type?: string;
      day?: string;
      context_tasks?: Array<{ id: number; text: string; done: boolean; day: string }>;
    };
    if (!audio_base64) { res.status(400).json({ error: 'No audio' }); return; }

    const audioBuffer = Buffer.from(audio_base64, 'base64');
    const transcribed = (await transcribeAudio(audioBuffer, mime_type || 'audio/webm')).trim();
    if (!transcribed) { res.status(200).json({ transcribed: '', type: 'empty', added: 0 }); return; }

    const today = getToday();
    const existingTasks = context_tasks ?? [];
    const intent = await parseIntent(transcribed, existingTasks, today);

    if (intent.type === 'new_tasks') {
      if (intent.tasks.length > 0) await saveTasks(userId, intent.tasks, day || today);
      res.status(200).json({ type: 'new_tasks', transcribed, added: intent.tasks.length });
      return;
    }

    // management commands
    const tomorrow = new Date(today + 'T12:00:00');
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().slice(0, 10);

    const results: string[] = [];
    for (const cmd of intent.commands) {
      const task = existingTasks[cmd.task_number - 1];
      if (!task) { results.push(`Задача ${cmd.task_number}: не найдена`); continue; }

      if (cmd.action === 'done') {
        await updateTask(task.id, userId, { done: true });
        results.push(`✅ ${task.text}`);
      } else if (cmd.action === 'delete') {
        await deleteTask(task.id, userId);
        results.push(`🗑 ${task.text}`);
      } else if (cmd.action === 'move') {
        const targetDay = cmd.date ?? tomorrowISO;
        await updateTask(task.id, userId, { day: targetDay, done: false });
        const label = targetDay === tomorrowISO ? 'завтра' : targetDay;
        results.push(`📅 ${task.text} → ${label}`);
      }
    }

    res.status(200).json({ type: 'manage', transcribed, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('voice error:', msg);
    res.status(500).json({ error: msg });
  }
}
