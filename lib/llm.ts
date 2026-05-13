import { env } from './env';

export interface Task {
  text: string;
  time: string | null;
}

const SYSTEM = `Ты помощник по планированию дня. Пользователь описывает свои планы голосом или текстом.
Извлеки список задач из сообщения и верни JSON вида:
{"tasks": [{"text": "название задачи", "time": "HH:MM или null"}]}
Время указывай только если оно явно упомянуто, иначе null.
Отвечай только валидным JSON, без объяснений.`;

export async function extractTasks(input: string): Promise<Task[]> {
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
        { role: 'system', content: SYSTEM },
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
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Не удалось разобрать ответ LLM: ${content}`);
  }

  if (Array.isArray(parsed)) return parsed as Task[];
  if (parsed && typeof parsed === 'object' && 'tasks' in parsed) {
    return (parsed as { tasks: Task[] }).tasks ?? [];
  }
  return [];
}
