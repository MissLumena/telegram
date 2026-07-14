import "node:process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from 'express';
import { buildBot } from "./bot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const token = process.env.BOT_TOKEN;
if (!token) { console.error("❌ BOT_TOKEN не задан!"); process.exit(1); }

const webhookUrl = process.env.WEBHOOK_URL;
if (!webhookUrl) { console.error("❌ WEBHOOK_URL не задан!"); process.exit(1); }

const bot = buildBot(token);
const port = process.env.PORT || 10000;
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body)
    .then(() => res.sendStatus(200))
    .catch((err) => { console.error('Webhook error:', err); res.sendStatus(500); });
});

app.get('/health', (req, res) => res.status(200).send('OK'));

// Сначала порт, потом webhook
app.listen(port, '0.0.0.0', async () => {
  console.log(`✅ Сервер поднят на порту ${port}`);
  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook установлен: ${webhookUrl}`);
  } catch (e) {
    console.error("❌ Ошибка setWebhook:", e?.message ?? e);
  }
});

process.once("SIGINT", () => { try { bot.stop("SIGINT"); } catch (_) {} process.exit(0); });
process.once("SIGTERM", () => { try { bot.stop("SIGTERM"); } catch (_) {} process.exit(0); });