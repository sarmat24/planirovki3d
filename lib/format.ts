import type { DbTask } from './db';

export function formatTaskList(tasks: DbTask[]): string {
  if (tasks.length === 0) return 'Задач нет. Расскажи о своих планах!';

  const lines = tasks.map((t, i) => {
    const status = t.done ? '✅' : '⬜';
    const time = t.time ? ` [${t.time}]` : '';
    return `${status} ${i + 1}.${time} ${t.text}`;
  });

  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  return `Задачи (${done}/${total}):\n\n${lines.join('\n')}`;
}

export function formatSavedTasks(
  tasks: Array<{ text: string; time: string | null; date?: string | null }>,
  today?: string
): string {
  if (tasks.length === 0) return 'Не удалось распознать задачи. Попробуй ещё раз.';

  const lines = tasks.map((t, i) => {
    const time = t.time ? ` [${t.time}]` : '';
    const dateStr = t.date && t.date !== today ? ` → ${t.date}` : '';
    return `${i + 1}.${time}${dateStr} ${t.text}`;
  });

  return `Сохранил ${tasks.length} задач:\n\n${lines.join('\n')}\n\nПосмотреть все: /today`;
}

export function getToday(): string {
  return new Date().toISOString().split('T')[0]!;
}

export function truncate(text: string, max = 1000): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}
