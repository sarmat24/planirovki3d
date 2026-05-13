import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { getTasksForRange, updateTask, deleteTask, saveTasks } from '../lib/db';
import { extractTasks } from '../lib/llm';
import { getToday } from '../lib/format';
import { env } from '../lib/env';

function validateInitData(initData: string): number | null {
  try {
    const pairs = initData.split('&');
    const hashEntry = pairs.find(p => p.startsWith('hash='));
    if (!hashEntry) return null;
    const hash = hashEntry.slice(5);

    const dataCheckString = pairs
      .filter(p => !p.startsWith('hash='))
      .sort()
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(env.TELEGRAM_TOKEN).digest();
    const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (expected !== hash) return null;

    const userEntry = pairs.find(p => p.startsWith('user='));
    if (!userEntry) return null;
    const userJson = decodeURIComponent(userEntry.slice(5));
    const user = JSON.parse(userJson) as { id?: number };
    return typeof user.id === 'number' ? user.id : null;
  } catch {
    return null;
  }
}

function getUserId(req: VercelRequest): number | null {
  const initData = req.headers['x-telegram-init-data'] as string | undefined;
  if (initData) {
    const id = validateInitData(initData);
    if (id) return id;
  }
  const uid = Number(req.query.uid);
  return !isNaN(uid) && uid > 0 ? uid : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const today = getToday();

  try {
    if (req.method === 'GET') {
      const from = (req.query.from as string) || today;
      const to = (req.query.to as string) || today;
      const tasks = await getTasksForRange(userId, from, to);
      res.status(200).json({ tasks, today });
      return;
    }

    if (req.method === 'POST') {
      const { text, day } = req.body as { text: string; day?: string };
      if (!text?.trim()) { res.status(400).json({ error: 'Пустой текст' }); return; }
      const defaultDay = day ?? today;
      const extracted = await extractTasks(text.trim(), today);
      if (extracted.length > 0) await saveTasks(userId, extracted, defaultDay);
      res.status(200).json({ added: extracted.length });
      return;
    }

    if (req.method === 'PATCH') {
      const body = req.body as { task_id: number; done?: boolean; text?: string; day?: string; time?: string | null };
      if (!body.task_id) { res.status(400).json({ error: 'Нужен task_id' }); return; }
      const updates: Parameters<typeof updateTask>[2] = {};
      if (typeof body.done === 'boolean') updates.done = body.done;
      if (typeof body.text === 'string') updates.text = body.text;
      if (typeof body.day === 'string') updates.day = body.day;
      if (body.time !== undefined) updates.time = body.time || null;
      await updateTask(body.task_id, userId, updates);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const { task_id } = req.body as { task_id: number };
      if (!task_id) { res.status(400).json({ error: 'Нужен task_id' }); return; }
      await deleteTask(task_id, userId);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('webapp error:', msg);
    res.status(500).json({ error: msg });
  }
}
