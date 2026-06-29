// Intent classifier for free-text user messages.
// Deterministic keyword stub — in production replaced by an LLM call via an
// edge-function proxy. The return contract stays the same.

const RULES = [
  { intent: "cancel", words: ["отмен", "перенес", "не смогу", "не приду", "снять запись"] },
  // FAQ checked before BOOK so "сколько стоит маникюр" → faq, not book.
  { intent: "faq", words: ["цен", "сколько стоит", "где вы", "адрес", "как доех", "работа", "часы", "график", "телефон", "контакт"] },
  { intent: "book", words: ["запиш", "хочу на", "можно на", "нужна запись", "стрижк", "маникюр", "педикюр", "бров", "окраш", "покраш"] },
];

export function classifyIntent(text) {
  const t = String(text).toLowerCase();
  for (const { intent, words } of RULES) {
    if (words.some((w) => t.includes(w))) return { intent, confidence: 0.9 };
  }
  return { intent: "unknown", confidence: 0 };
}

// Best-effort entity extraction from free text.
export function extractEntities(text) {
  const t = String(text).toLowerCase();
  const entities = {};
  if (/стриж/.test(t)) entities.serviceHint = "haircut";
  if (/окраш|покраш|цвет/.test(t)) entities.serviceHint = "coloring";
  if (/маникюр/.test(t)) entities.serviceHint = "manicure";
  if (/педикюр/.test(t)) entities.serviceHint = "pedicure";
  if (/бров/.test(t)) entities.serviceHint = "brows";
  if (/сегодня|сейчас/.test(t)) entities.dateHint = "today";
  if (/завтра/.test(t)) entities.dateHint = "tomorrow";
  return entities;
}

// Stands in for RAG over a knowledge base.
export function answerFaq(text) {
  const t = String(text).toLowerCase();
  if (/цен|сколько стоит/.test(t)) {
    return "Актуальные цены:\n• Стрижка — 2500 ₽\n• Окрашивание — 4500 ₽\n• Маникюр+покрытие — 2000 ₽\n• Педикюр — 2200 ₽\n• Брови — 1200 ₽";
  }
  if (/адрес|где|как доех/.test(t)) {
    return "Мы находимся: ул. Примерная, 12, 2 этаж. Метро Парк культуры, 5 минут пешком.";
  }
  if (/часы|работа|график/.test(t)) {
    return "Мы работаем вт–вс, 10:00–20:00. Понедельник — выходной.";
  }
  if (/телефон|контакт/.test(t)) {
    return "Связаться с администратором: +7 (495) 000-00-00.";
  }
  return "Я пока не знаю ответ на этот вопрос. Нажмите «Записаться» или «Отменить запись» — или позвоните +7 (495) 000-00-00.";
}
