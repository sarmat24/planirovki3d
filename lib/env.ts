export const env = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN ?? process.env.Telegram_token ?? process.env.telegram_token ?? '',
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? process.env.groq_api_key ?? '',
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.supabase_url ?? '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.supabase_service_role_key ?? '',
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? process.env.telegram_webhook_secret ?? '',
  CRON_SECRET: process.env.CRON_SECRET ?? '',
};

const REQUIRED = ['TELEGRAM_TOKEN', 'GROQ_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

export function validateEnv(): void {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Отсутствует переменная окружения: ${key}`);
  }
}
