import { env } from './env';
import { truncate } from './format';

const BASE = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}`;

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const body = {
    chat_id: chatId,
    text: truncate(text),
  };

  const res = await fetch(`${BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('sendMessage error:', err);
  }
}

export async function getFile(fileId: string): Promise<{ file_path: string }> {
  const res = await fetch(`${BASE}/getFile?file_id=${fileId}`);
  const data = await res.json() as { ok: boolean; result: { file_path: string } };
  if (!data.ok) throw new Error(`getFile failed: ${JSON.stringify(data)}`);
  return data.result;
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_TOKEN}/${filePath}`);
  if (!res.ok) throw new Error(`downloadFile failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
