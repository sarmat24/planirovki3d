import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env, validateEnv } from '../lib/env';
import { sendMessage, getFile, downloadFile } from '../lib/telegram';
import { transcribeAudio } from '../lib/transcribe';
import { handleStart, handleToday, handleDone, handleClear, handleText, handleMyId, handleWebApp } from '../lib/handlers';

interface TgFrom {
  id: number;
  first_name: string;
}

interface TgVoice {
  file_id: string;
  mime_type?: string;
  duration: number;
}

interface TgMessage {
  message_id: number;
  from?: TgFrom;
  chat: { id: number };
  text?: string;
  voice?: TgVoice;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

async function processUpdate(req: VercelRequest): Promise<void> {
  if (req.method !== 'POST') return;

  // Проверяем секрет webhook (если выставлен)
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    console.warn('Неверный webhook secret');
    return;
  }

  validateEnv();

  const update = req.body as TgUpdate;
  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!userId) return;

  // Текстовые команды и сообщения
  if (msg.text) {
    const spaceIdx = msg.text.indexOf(' ');
    const command = spaceIdx >= 0 ? msg.text.slice(0, spaceIdx) : msg.text;
    const args = spaceIdx >= 0 ? msg.text.slice(spaceIdx + 1) : '';

    switch (command) {
      case '/start':
        await handleStart(chatId);
        break;
      case '/today':
        await handleToday(chatId, userId);
        break;
      case '/done':
        await handleDone(chatId, userId, args);
        break;
      case '/clear':
        await handleClear(chatId, userId);
        break;
      case '/myid':
        await handleMyId(chatId, userId);
        break;
      case '/app':
        await handleWebApp(chatId);
        break;
      default:
        if (!msg.text.startsWith('/')) {
          await handleText(chatId, userId, msg.text);
        }
    }
    return;
  }

  // Голосовые сообщения
  if (msg.voice) {
    console.log('Voice: start, file_id=', msg.voice.file_id);
    await sendMessage(chatId, 'Обрабатываю голосовое сообщение...');

    console.log('Voice: getFile');
    const file = await getFile(msg.voice.file_id);
    console.log('Voice: downloadFile', file.file_path);
    const audio = await downloadFile(file.file_path);
    console.log('Voice: transcribe, bytes=', audio.length);
    const transcribed = await transcribeAudio(audio, msg.voice.mime_type ?? 'audio/ogg');
    console.log('Voice: transcribed=', transcribed);

    await sendMessage(chatId, `Распознал: "${transcribed}"`);
    await handleText(chatId, userId, transcribed);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    await processUpdate(req);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message + '\n' + err.stack : JSON.stringify(err);
    console.error('Webhook error:', errMsg);
  }
  // Всегда возвращаем 200 в конце — после обработки
  res.status(200).json({ ok: true });
}
