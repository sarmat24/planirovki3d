import { sendMessage } from './telegram';
import { getTodayTasks, markDone, clearTodayTasks, saveTasks } from './db';
import { extractTasks } from './llm';
import { formatTaskList, formatSavedTasks, getToday } from './format';

export async function handleStart(chatId: number): Promise<void> {
  await sendMessage(chatId,
    'Привет! Я бот утреннего планирования.\n\n' +
    'Расскажи голосом или напиши свои планы на день — я сохраню их как задачи.\n\n' +
    'Команды:\n' +
    '/today — задачи на сегодня\n' +
    '/done <номер> — отметить задачу выполненной\n' +
    '/clear — очистить задачи на сегодня'
  );
}

export async function handleToday(chatId: number, userId: number): Promise<void> {
  const tasks = await getTodayTasks(userId, getToday());
  await sendMessage(chatId, formatTaskList(tasks));
}

export async function handleDone(chatId: number, userId: number, args: string): Promise<void> {
  const tasks = await getTodayTasks(userId, getToday());

  if (tasks.length === 0) {
    await sendMessage(chatId, 'На сегодня задач нет.');
    return;
  }

  const pending = tasks.filter(t => !t.done);
  const num = parseInt(args.trim(), 10);

  if (!num || num < 1 || num > tasks.length) {
    await sendMessage(chatId,
      `Укажи номер задачи. Например: /done 2\n\n${formatTaskList(tasks)}`
    );
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
  await sendMessage(chatId,
    `Твой Telegram ID: ${userId}\n\nИспользуй его для входа на сайт планировщика.`
  );
}

export async function handleClear(chatId: number, userId: number): Promise<void> {
  const count = await clearTodayTasks(userId, getToday());
  await sendMessage(chatId, `Удалено ${count} задач на сегодня.`);
}

export async function handleText(chatId: number, userId: number, text: string): Promise<void> {
  await sendMessage(chatId, 'Обрабатываю...');

  const tasks = await extractTasks(text);

  if (tasks.length === 0) {
    await sendMessage(chatId, 'Не удалось распознать задачи. Опиши планы подробнее.');
    return;
  }

  await saveTasks(userId, tasks, getToday());
  await sendMessage(chatId, formatSavedTasks(tasks));
}
