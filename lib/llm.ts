import { env } from './env';

export interface Task {
  text: string;
  time: string | null;
  date: string | null; // ISO YYYY-MM-DD, null = default day
}

export interface ManageCommand {
  action: 'move' | 'done' | 'delete';
  task_number: number;
  date?: string; // ISO YYYY-MM-DD, only for 'move'
}

export type ParsedIntent =
  | { type: 'new_tasks'; tasks: Task[] }
  | { type: 'manage'; commands: ManageCommand[] };

const makeSystem = (today: string) =>
  `Ты помощник по планированию. Сегодня: ${today}.
Из текста пользователя извлеки список задач и верни JSON:
{"tasks": [{"text": "название", "time": "HH:MM или null", "date": "YYYY-MM-DD или null"}]}
- time: только если явно указано время
- date: если упомянут конкретный день (завтра, послезавтра, в пятницу, через неделю и т.д.) — вычисли точную дату. Иначе null (= сегодня).
Только JSON без пояснений.`;

const makeManageSystem = (today: string, taskList: string) =>
  `Ты помощник по планированию. Сегодня: ${today}.
Текущие задачи пользователя:
${taskList}

Пользователь говорит что делать с этими задачами. Определи намерение и верни JSON.

Если создаёт НОВЫЕ задачи:
{"type":"new_tasks","tasks":[{"text":"...","time":"HH:MM или null","date":"YYYY-MM-DD или null"}]}

Если управляет СУЩЕСТВУЮЩИМИ (перенести, удалить, отметить выполненным):
{"type":"manage","commands":[{"action":"move|done|delete","task_number":N,"date":"YYYY-MM-DD"}]}
- task_number: номер из списка выше (1, 2, ...)
- date: только для action "move"

Только JSON без пояснений.`;

export async function extractTasks(input: string, today: string): Promise<Task[]> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: makeSystem(today) },
        { role: 'user', content: input },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq LLM error: ${err}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content ?? '{}';

  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error(`Не удалось разобрать ответ LLM: ${content}`); }

  if (Array.isArray(parsed)) return parsed as Task[];
  if (parsed && typeof parsed === 'object' && 'tasks' in parsed) {
    return (parsed as { tasks: Task[] }).tasks ?? [];
  }
  return [];
}

async function callGroq(system: string, user: string): Promise<unknown> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Groq error: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(data.choices[0]?.message?.content ?? '{}');
}

export async function parseIntent(
  input: string,
  existingTasks: Array<{ id: number; text: string; done: boolean }>,
  today: string
): Promise<ParsedIntent> {
  if (existingTasks.length === 0) {
    const tasks = await extractTasks(input, today);
    return { type: 'new_tasks', tasks };
  }

  const taskList = existingTasks
    .map((t, i) => `${i + 1}. [${t.done ? '✅' : '⬜'}] ${t.text}`)
    .join('\n');

  const parsed = await callGroq(makeManageSystem(today, taskList), input) as ParsedIntent;

  if (parsed?.type === 'manage' && Array.isArray((parsed as { type: string; commands: ManageCommand[] }).commands)) {
    return parsed as ParsedIntent;
  }
  if (parsed?.type === 'new_tasks' && Array.isArray((parsed as { type: string; tasks: Task[] }).tasks)) {
    return parsed as ParsedIntent;
  }
  return { type: 'new_tasks', tasks: [] };
}
