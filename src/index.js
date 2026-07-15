import { buildBot } from "./bot.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN environment variable.");
  process.exit(1);
}

const bot = buildBot(BOT_TOKEN);

bot.launch()
  .then(() => console.log("✅ Telegram bot started."))
  .catch((err) => {
    console.error("Failed to launch bot:", err);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
