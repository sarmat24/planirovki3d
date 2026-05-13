import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Task } from './llm';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export interface DbTask {
  id: number;
  user_id: number;
  text: string;
  time: string | null;
  day: string;
  done: boolean;
  created: string;
}

export async function saveTasks(userId: number, tasks: Task[], defaultDay: string): Promise<void> {
  const rows = tasks.map(t => ({
    user_id: userId,
    text: t.text,
    time: t.time ?? null,
    day: t.date ?? defaultDay,
    done: false,
    created: new Date().toISOString(),
  }));
  const { error } = await supabase.from('tasks').insert(rows);
  if (error) throw new Error(`Ошибка сохранения задач: ${JSON.stringify(error)}`);
}

export async function getTasksForRange(userId: number, fromDay: string, toDay: string): Promise<DbTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .gte('day', fromDay)
    .lte('day', toDay)
    .order('day', { ascending: true })
    .order('time', { ascending: true, nullsFirst: false })
    .order('created', { ascending: true });

  if (error) throw new Error(`Ошибка получения задач: ${JSON.stringify(error)}`);
  return (data ?? []) as DbTask[];
}

export async function getTodayTasks(userId: number, day: string): Promise<DbTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .or(`day.eq.${day},done.eq.false`)
    .order('day', { ascending: true })
    .order('time', { ascending: true, nullsFirst: false })
    .order('created', { ascending: true });

  if (error) throw new Error(`Ошибка получения задач: ${JSON.stringify(error)}`);
  return (data ?? []) as DbTask[];
}

export async function markDone(taskId: number, userId: number): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ done: true })
    .eq('id', taskId)
    .eq('user_id', userId);
  if (error) throw new Error(`Ошибка обновления задачи: ${JSON.stringify(error)}`);
}

export async function updateTask(
  taskId: number,
  userId: number,
  updates: Partial<Pick<DbTask, 'text' | 'day' | 'done' | 'time'>>
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('user_id', userId);
  if (error) throw new Error(`Ошибка обновления задачи: ${JSON.stringify(error)}`);
}

export async function deleteTask(taskId: number, userId: number): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);
  if (error) throw new Error(`Ошибка удаления задачи: ${JSON.stringify(error)}`);
}

export async function clearTodayTasks(userId: number, _day: string): Promise<number> {
  const { data, error } = await supabase
    .from('tasks')
    .delete()
    .eq('user_id', userId)
    .select('id');
  if (error) throw new Error(`Ошибка удаления задач: ${JSON.stringify(error)}`);
  return data?.length ?? 0;
}
