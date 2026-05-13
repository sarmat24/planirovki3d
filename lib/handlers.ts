import { sendMessage } from './telegram';
import { getTodayTasks, markDone, clearTodayTasks, saveTasks, updateTask, deleteTask } from './db';
import { extractTasks, parseIntent } from './llm';
import { formatTaskList, formatSavedTasks, getToday } from './format';

const APP_URL = 'https://planirovki3d-git-main-alika-s-projects1.vercel.app';

const appButton = {
  reply_markup: {
    inline_keyboard: [[{ text: '📋 Открыть планировщик', web_app: { url: APP_URL } }]],
  },
};

export async function handleStart(chatId: number): Promise<void> {
  await sendMessage(
    chatId,
    'Привет! Я бот утреннего планирования.\n\n' +
    'Расскажи голосом или напиши свои планы на день — я сохраню их как задачи.\n\n' +
    'Команды:\n' +
    '/today — задачи на сегодня\n' +
    '/done <номер> — отметить задачу выполненной\n' +
    '/clear — очистить все задачи\n' +
    '/app — открыть планировщик',
    appButton
  );
}

export async function handleWebApp(chatId: number): Promise<void> {
  await sendMessage(chatId, 'Открываю планировщик:', appButton);
}

export async function handleToday(chatId: number, userId: number): Promise<void> {
  const tasks = await getTodayTasks(userId, getToday());
  await sendMessage(chatId, formatTaskList(tasks), tasks.length > 0 ? appButton : undefined);
}

export async function handleDone(chatId: number, userId: number, args: string): Promise<void> {
  const tasks = await getTodayTasks(userId, getToday());

  if (tasks.length === 0) {
    await sendMessage(chatId, 'Задач нет. Расскажи о своих планах!');
    return;
  }

  const num = parseInt(args.trim(), 10);
  if (!num || num < 1 || num > tasks.length) {
    await sendMessage(chatId, `Укажи номер задачи. Например: /done 2\n\n${formatTaskList(tasks)}`);
    return;
  }

  const task = tasks[num - 1]!;
  if (task.done) {
    await sendMessage(chatId, `Задача уже выполнена.\n\n${formatTaskList(tasks)}`);
    return;
  }

  await markDone(task.id, userId);
  const updated = await getTodayTasks(userId, getToday());
  await sendMessage(chatId, `Выполнено!\n\n${formatTaskList(updated)}`);
}

export async function handleMyId(chatId: number, userId: number): Promise<void> {
  await sendMessage(chatId, `Твой Telegram ID: ${userId}\n\nИспользуй его для входа на сайт планировщика.`);
}

export async function handleClear(chatId: number, userId: number): Promise<void> {
  const count = await clearTodayTasks(userId, getToday());
  await sendMessage(chatId, `Удалено ${count} задач.`);
}

export async function handleText(chatId: number, userId: number, text: string): Promise<void> {
  await sendMessage(chatId, 'Обрабатываю...');
  const today = getToday();
  const existing = await getTodayTasks(userId, today);
  const intent = await parseIntent(text, existing, today);

  if (intent.type === 'new_tasks') {
    if (!intent.tasks.length) {
      await sendMessage(chatId, 'Не удалось распознать задачи. Опиши планы подробнее.');
      return;
    }
    await saveTasks(userId, intent.tasks, today);
    await sendMessage(chatId, formatSavedTasks(intent.tasks, today));
    return;
  }

  // manage commands
  const { commands } = intent;
  if (!commands.length) {
    await sendMessage(chatId, 'Не понял команду. Попробуй ещё раз.');
    return;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().split('T')[0]!;

  const results: string[] = [];
  for (const cmd of commands) {
    const task = existing[cmd.task_number - 1];
    if (!task) { results.push(`Задача ${cmd.task_number}: не найдена`); continue; }

    if (cmd.action === 'done') {
      await updateTask(task.id, userId, { done: true });
      results.push(`✅ Выполнено: ${task.text}`);
    } else if (cmd.action === 'delete') {
      await deleteTask(task.id, userId);
      results.push(`🗑 Удалено: ${task.text}`);
    } else if (cmd.action === 'move') {
      const targetDay = cmd.date ?? tomorrowISO;
      await updateTask(task.id, userId, { day: targetDay, done: false });
      const label = targetDay === tomorrowISO ? 'завтра' : targetDay;
      results.push(`📅 Перенесено на ${label}: ${task.text}`);
    }
  }

  await sendMessage(chatId, results.join('\n'));
}

export async function handleDailyDigest(chatId: number, userId: number): Promise<void> {
  const today = getToday();
  const tasks = await getTodayTasks(userId, today);
  const todayOnly = tasks.filter(t => t.day === today);

  if (todayOnly.length === 0) {
    await sendMessage(chatId, '📊 На сегодня задач не было. Хорошего вечера!');
    return;
  }

  const done = todayOnly.filter(t => t.done);
  const pending = todayOnly.filter(t => !t.done);

  const all = [...done, ...pending];
  const lines = all.map((t, i) => `${i + 1}. ${t.done ? '✅' : '⬜'} ${t.text}`).join('\n');

  let text = `📊 Итоги дня — ${formatDate(today)}\n\n${lines}`;

  if (pending.length > 0) {
    text += `\n\n${pending.length} задач не выполнено. Скажи голосом что перенести, что удалить. Например: "четвёртую перенеси на завтра, пятую удали"`;
  } else {
    text += '\n\n🎉 Все задачи выполнены! Отличный день!';
  }

  await sendMessage(chatId, text);
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
