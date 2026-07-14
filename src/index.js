import "node:process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from 'express';
import { buildBot } from "./bot.js";

// Загрузка .env
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const token = process.env.BOT_TOKEN;
console.log("BOT_TOKEN присутствует:", !!token);

if (!token) {
  console.error("❌ BOT_TOKEN не задан!");
  process.exit(1);
}

console.log("Создаём бота...");
const bot = buildBot(token);
console.log("Бот создан, запускаем...");

const port = process.env.PORT || 10000;
const webhookUrl = process.env.WEBHOOK_URL;

if (!webhookUrl) {
  console.error("❌ WEBHOOK_URL не задан!");
  process.exit(1);
}

console.log(`🌐 Настраиваем webhook на: ${webhookUrl}`);

try {
  await bot.telegram.setWebhook(webhookUrl);
  console.log(`✅ Webhook установлен на ${webhookUrl}`);

  const app = express();
  app.use(express.json());

  // === ЭТОТ ОБРАБОТЧИК ДОЛЖЕН БЫТЬ ===
  app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body, res);
  });
  // =====================================

  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Бот запущен в режиме webhook на порту ${port}`);
    console.log(`📨 Обновления принимаются по адресу: ${webhookUrl}`);
  });

} catch (e) {
  console.error("❌ Ошибка при запуске:", e?.message ?? e);
  process.exit(1);
}

const stop = (sig) => {
  console.log(`\n${sig} received, stopping...`);
  bot.stop(sig);
  process.exit(0);
};
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));