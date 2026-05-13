import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUsersWithTasksOnDay } from '../lib/db';
import { handleDailyDigest } from '../lib/handlers';
import { getToday } from '../lib/format';
import { env } from '../lib/env';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Vercel Cron отправляет Authorization: Bearer CRON_SECRET
  const auth = req.headers['authorization'];
  if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const today = getToday();
  const userIds = await getUsersWithTasksOnDay(today);

  const results = await Promise.allSettled(
    userIds.map(userId => handleDailyDigest(userId, userId))
  );

  const ok = results.filter(r => r.status === 'fulfilled').length;
  const fail = results.filter(r => r.status === 'rejected').length;

  console.log(`Cron digest: ${ok} ok, ${fail} failed`);
  res.status(200).json({ ok, fail, total: userIds.length });
}
