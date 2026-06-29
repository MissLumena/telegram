import "node:process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildBot } from "./bot.js";

// Minimal .env loader (no dotenv dependency): reads .env in project root.
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const token = process.env.BOT_TOKEN;
console.log("Загруженные переменные окружения:", Object.keys(process.env).filter(k => k.startsWith("BOT") || k.startsWith("VITE")));
console.log("BOT_TOKEN присутствует:", !!token);

if (!token) {
  console.error("BOT_TOKEN не задан. Укажите его в .env (получите у @BotFather).");
  process.exit(1);
}

console.log("Создаём бота...");
const bot = buildBot(token);
console.log("Бот создан, запускаем...");

bot.catch((err) => console.error("Bot error:", err?.message ?? err));

console.log("Запускаем bot.launch() с polling mode...");

// Create a timeout promise as a safety net (30 sec for initial connection)
const launchTimeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Bot launch timed out after 30 seconds")), 30000)
);

Promise.race([
  bot.launch({ polling: true }),
  launchTimeout
])
  .then(() => {
    console.log("✅ Bot started in polling mode. Press Ctrl+C to stop.");
  })
  .catch((e) => {
    console.error("❌ Failed to start:", e?.message ?? e);
    process.exit(1);
  });

const stop = (sig) => {
  console.log(`\n${sig} received, stopping...`);
  bot.stop(sig);
  process.exit(0);
};
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
