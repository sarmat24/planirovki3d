import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTodayTasks, markDone, saveTasks } from '../lib/db';
import { extractTasks } from '../lib/llm';
import { getToday } from '../lib/format';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const userId = Number(req.query.uid);
  if (!userId || isNaN(userId)) {
    res.status(400).json({ error: 'Нужен параметр uid' });
    return;
  }

  const day = getToday();

  try {
    if (req.method === 'GET') {
      const tasks = await getTodayTasks(userId, day);
      res.status(200).json({ tasks, day });
      return;
    }

    if (req.method === 'PATCH') {
      const { task_id } = req.body as { task_id: number };
      await markDone(task_id, userId);
      const tasks = await getTodayTasks(userId, day);
      res.status(200).json({ tasks });
      return;
    }

    if (req.method === 'POST') {
      const { text } = req.body as { text: string };
      if (!text?.trim()) { res.status(400).json({ error: 'Пустой текст' }); return; }
      const extracted = await extractTasks(text.trim());
      if (extracted.length > 0) await saveTasks(userId, extracted, day);
      const tasks = await getTodayTasks(userId, day);
      res.status(200).json({ tasks, added: extracted.length });
      return;
    }

    res.status(405).end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('webapp error:', msg);
    res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
