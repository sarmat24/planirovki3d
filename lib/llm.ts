import { env } from './env';

export interface Task {
  text: string;
  time: string | null;
  date: string | null; // ISO YYYY-MM-DD, null = default day
}

const makeSystem = (today: string) =>
  `Ты помощник по планированию. Сегодня: ${today}.
Из текста пользователя извлеки список задач и верни JSON:
{"tasks": [{"text": "название", "time": "HH:MM или null", "date": "YYYY-MM-DD или null"}]}
- time: только если явно указано время
- date: если упомянут конкретный день (завтра, послезавтра, в пятницу, через неделю и т.д.) — вычисли точную дату. Иначе null (= сегодня).
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
