import http from "node:http";
import { buildBot } from "./bot.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN environment variable.");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);

const bot = buildBot(BOT_TOKEN);

bot.launch()
  .then(() => console.log("✅ Telegram bot started."))
  .catch((err) => {
    console.error("Failed to launch bot:", err);
    process.exit(1);
  });

const server = http.createServer((req, res) => {
  if (req.url === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK\n");
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found\n");
});

server.listen(PORT, () => {
  console.log(`✅ HTTP health server listening on port ${PORT}`);
});

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  server.close();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  server.close();
});
