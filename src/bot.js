import { Telegraf } from "telegraf";
import { States, getState, getContext, setState, reset } from "./fsm.js";
import {
  serviceById,
  masterById,
  mastersForService,
  getAvailableDates,
  TIME_SLOTS,
} from "./data.js";
import {
  createAppointment,
  getAvailableTimeSlots,
  getAppointmentsByPhone,
  cancelAppointment,
  isValidPhone,
  normalizePhone,
} from "./appointments.js";
import { randomUUID } from "node:crypto";
import { classifyIntent, extractEntities, answerFaq } from "./ai.js";
import {
  mainMenu,
  serviceKeyboard,
  masterKeyboard,
  dateKeyboard,
  timeKeyboard,
  confirmKeyboard,
  cancelListKeyboard,
  cancelConfirmKeyboard,
  backHomeKeyboard,
} from "./keyboards.js";

const fmtDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

function summary(ctx) {
  const svc = serviceById(ctx.serviceId);
  const mst = ctx.masterId === "any" ? "Любой мастер" : masterById(ctx.masterId)?.name ?? ctx.masterId;
  return [
    "Проверьте запись:",
    `• Услуга: ${svc?.title ?? ctx.serviceId} — ${svc?.price ?? ""} ₽`,
    `• Мастер: ${mst}`,
    `• Дата: ${fmtDate(ctx.date)}`,
    `• Время: ${ctx.time}`,
    `• Имя: ${ctx.name}`,
    `• Телефон: ${ctx.phone}`,
  ].join("\n");
}

async function safeEdit(ctx, text, markup) {
  try {
    return await ctx.editMessageText(text, markup);
  } catch (err) {
    const msg = err?.response?.description ?? err.message;
    if (msg && msg.includes('message is not modified')) {
      // benign: Telegram returns 400 if content+markup same — ignore
      await safeAnswerCbQuery(ctx).catch(() => {});
      return null;
    }
    throw err;
  }
}

async function safeAnswerCbQuery(ctx, text) {
  try {
    return await ctx.answerCbQuery(text);
  } catch (err) {
    const desc = err?.response?.description ?? err?.message ?? '';
    // Ignore common benign Telegram callback errors
    if (
      desc.includes('message is not modified') ||
      desc.includes('query is too old') ||
      desc.includes('query ID is invalid') ||
      desc.includes('callback query is not found')
    ) {
      return null;
    }
    // Log other errors but do not crash handlers
    console.warn('safeAnswerCbQuery failed:', desc);
    return null;
  }
}

export function buildBot(token) {
  console.log("🤖 Создаём новый Telegraf бот...");
  const bot = new Telegraf(token);
  console.log("🤖 Бот создан, регистрируем обработчики...");

  // ---- /start & global navigation ----------------------------------------
  console.log("  - Регистрируем /start");
  bot.start((ctx) => {
    reset(ctx.from.id);
    setState(ctx.from.id, States.START);
    return ctx.reply("Добро пожаловать в салон красоты! Выберите действие:", mainMenu());
  });

  bot.action("nav:home", async (ctx) => {
    reset(ctx.from.id);
    setState(ctx.from.id, States.START);
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Выберите действие:", mainMenu());
  });

  bot.action("faq:info", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    return ctx.reply(answerFaq("цены адрес часы"), backHomeKeyboard());
  });

  // ---- BOOKING SCENARIO --------------------------------------------------
  bot.action("book:start", async (ctx) => {
    setState(ctx.from.id, States.CHOOSING_SERVICE, {});
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Выберите услугу:", serviceKeyboard());
  });

  bot.action(/^book:svc:(.+)$/, async (ctx) => {
    const serviceId = ctx.match[1];
    if (!serviceById(serviceId)) return safeAnswerCbQuery(ctx, "Услуга не найдена");
    setState(ctx.from.id, States.CHOOSING_MASTER, { serviceId });
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Выберите мастера:", masterKeyboard(serviceId));
  });

  bot.action("book:back:svc", async (ctx) => {
    setState(ctx.from.id, States.CHOOSING_SERVICE, {});
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Выберите услугу:", serviceKeyboard());
  });

  bot.action(/^book:mst:(.+)$/, async (ctx) => {
    const masterId = ctx.match[1];
    const { serviceId } = getContext(ctx.from.id);
    if (!serviceId) return ctx.answerCbQuery("Сессия устарела, начните заново");
    if (masterId !== "any" && !mastersForService(serviceId).some((m) => m.id === masterId)) {
      return safeAnswerCbQuery(ctx, "Мастер не найден");
    }
    setState(ctx.from.id, States.CHOOSING_DATE, { serviceId, masterId });
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Выберите дату:", dateKeyboard());
  });

  bot.action("book:back:mst", async (ctx) => {
    const { serviceId } = getContext(ctx.from.id);
    setState(ctx.from.id, States.CHOOSING_MASTER, { serviceId });
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Выберите мастера:", masterKeyboard(serviceId));
  });

  bot.action(/^book:date:(.+)$/, async (ctx) => {
    const date = ctx.match[1];
    const context = getContext(ctx.from.id);
    if (!getAvailableDates().some((d) => d.id === date)) return safeAnswerCbQuery(ctx, "Дата недоступна");
    setState(ctx.from.id, States.CHOOSING_TIME, { date });
    
await safeAnswerCbQuery(ctx);

let availableSlots = [];
try {
  availableSlots = await getAvailableTimeSlots(context.serviceId, context.masterId, date);
} catch (e) {
  console.error("available slots error:", e.message);
  const nowMoscow = new Date(new Date().getTime() + 3 * 60 * 60 * 1000);
  const todayId = nowMoscow.toISOString().slice(0, 10);
  const currentMinutes = nowMoscow.getUTCHours() * 60 + nowMoscow.getUTCMinutes();
  availableSlots = TIME_SLOTS.filter((t) => {
    if (date !== todayId) return true;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m > currentMinutes + 30;
  });
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(
    ctx,
    "Не удалось загрузить актуальные слоты. Показываю стандартный список (могут быть недоступны):",
    dateKeyboard()
  ).catch(() => {});
  
  return safeEdit(ctx, "Выберите время:", timeKeyboard(availableSlots));
}

if (!availableSlots.length) {
  setState(ctx.from.id, States.CHOOSING_DATE, context);
  return safeEdit(ctx, "На эту дату нет свободных слотов. Выберите другую дату:", dateKeyboard());
}

return safeEdit(ctx, "Выберите время:", timeKeyboard(availableSlots));
  });

  bot.action("book:back:date", async (ctx) => {
    setState(ctx.from.id, States.CHOOSING_DATE, getContext(ctx.from.id));
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Выберите дату:", dateKeyboard());
  });

  bot.action(/^book:time:(.+)$/, async (ctx) => {
    const time = ctx.match[1];
    if (!TIME_SLOTS.includes(time)) return safeAnswerCbQuery(ctx, "Время недоступно");
    setState(ctx.from.id, States.ENTERING_NAME, { time });
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Введите ваше имя текстом:", backHomeKeyboard());
  });

  // ---- CANCELLATION SCENARIO ---------------------------------------------
  bot.action("cancel:start", async (ctx) => {
    setState(ctx.from.id, States.CANCEL_SEARCH, {});
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText(
      "Введите ваш номер телефона, чтобы найти записи (например, +79991234567):",
      backHomeKeyboard()
    );
  });

  bot.action(/^cancel:pick:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const { phone } = getContext(ctx.from.id);
    setState(ctx.from.id, States.CANCEL_CONFIRM, { cancelId: id, phone });
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText("Отменить эту запись?", cancelConfirmKeyboard(id));
  });

  bot.action("cancel:no", async (ctx) => {
    const { phone } = getContext(ctx.from.id);
    let list = [];
    try {
      list = await getAppointmentsByPhone(phone);
    } catch (e) {
      console.error("list_by_phone error:", e.message);
    }
    setState(ctx.from.id, States.CANCEL_LIST, { phone });
    await safeAnswerCbQuery(ctx);
    return ctx.editMessageText(
      list.length ? "Ваши активные записи:" : "Активных записей нет.",
      cancelListKeyboard(list)
    );
  });

  bot.action(/^cancel:yes:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const { phone } = getContext(ctx.from.id);
    try {
      await cancelAppointment(id, phone);
    } catch (e) {
      console.error("cancel error:", e.message);
      await safeAnswerCbQuery(ctx, "Ошибка отмены");
      return ctx.editMessageText("Не удалось отменить запись. Попробуйте позже или позвоните +7 (495) 000-00-00.", mainMenu());
    }
    setState(ctx.from.id, States.CANCEL_DONE);
    await safeAnswerCbQuery(ctx, "Запись отменена");
    return ctx.editMessageText("Запись отменена. Ждём вас снова!", mainMenu());
  });

  // ---- Confirm / abort booking -------------------------------------------
  bot.action("book:confirm", async (ctx) => {
    const c = getContext(ctx.from.id);
    if (!c.serviceId || !c.date || !c.time || !c.name || !c.phone) {
      await safeAnswerCbQuery(ctx, "Сессия устарела");
      return ctx.editMessageText("Данные устарели. Начните заново.", mainMenu());
    }
    setState(ctx.from.id, States.SAVING);
    const svc = serviceById(c.serviceId);
    const mst = c.masterId === "any" ? "Любой мастер" : masterById(c.masterId)?.name ?? c.masterId;
    const id = randomUUID().slice(0, 8);
    try {
      await createAppointment({
        id,
        serviceId: c.serviceId,
        serviceTitle: svc?.title ?? c.serviceId,
        masterId: c.masterId,
        masterName: mst,
        date: c.date,
        time: c.time,
        name: c.name,
        phone: c.phone,
        telegramUserId: ctx.from.id,
      });
    } catch (e) {
      console.error("create appointment error:", e.message);
      setState(ctx.from.id, States.START);
      await safeAnswerCbQuery(ctx, "Ошибка сохранения");
      if (e.message.includes("slot unavailable")) {
        return ctx.editMessageText(
          "Выбранный слот уже заняли. Пожалуйста, начните запись заново и выберите другое время.",
          mainMenu()
        );
      }
      return ctx.editMessageText("Не удалось сохранить запись. Попробуйте позже или позвоните +7 (495) 000-00-00.", mainMenu());
    }
    setState(ctx.from.id, States.SUCCESS);
    await safeAnswerCbQuery(ctx, "Готово!");
    return ctx.editMessageText(
      `Вы записаны!\n${summary(c)}\n\nНомер записи: ${id}`,
      mainMenu()
    );
  });

  bot.action("book:abort", async (ctx) => {
    reset(ctx.from.id);
    setState(ctx.from.id, States.START);
    await safeAnswerCbQuery(ctx, "Отменено");
    return ctx.editMessageText("Запись прервана. Выберите действие:", mainMenu());
  });

  // ---- TEXT HANDLER: state-driven + free-text AI -------------------------
  bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const state = getState(userId);
    const text = ctx.message.text.trim();

    // Free-text AI layer: route intent switches from non-input states.
    const { intent } = classifyIntent(text);
    const inputStates = [States.ENTERING_NAME, States.ENTERING_PHONE, States.CANCEL_SEARCH];
    if (!inputStates.includes(state)) {
      if (intent === "book") {
        const ents = extractEntities(text);
        setState(userId, States.CHOOSING_SERVICE, ents.serviceHint ? { serviceId: ents.serviceHint } : {});
        return ctx.reply("Понял, оформим запись. Выберите услугу:", serviceKeyboard());
      }
      if (intent === "cancel") {
        setState(userId, States.CANCEL_SEARCH, {});
        return ctx.reply("Введите ваш номер телефона, чтобы найти записи:", backHomeKeyboard());
      }
      if (intent === "faq") {
        return ctx.reply(answerFaq(text), backHomeKeyboard());
      }
    }

    // State-driven text input
    switch (state) {
      case States.ENTERING_NAME: {
        const name = text.slice(0, 60);
        if (name.length < 2) return ctx.reply("Имя слишком короткое. Введите имя:");
        setState(userId, States.ENTERING_PHONE, { name });
        return ctx.reply("Введите номер телефона (например, +79991234567):", backHomeKeyboard());
      }
      case States.ENTERING_PHONE: {
        if (!isValidPhone(text)) return ctx.reply("Неверный формат. Введите телефон в формате +79991234567:");
        const phone = normalizePhone(text);
        const c = getContext(userId);
        setState(userId, States.CONFIRMING, { phone });
        return ctx.reply(summary({ ...c, phone }), confirmKeyboard());
      }
      case States.CANCEL_SEARCH: {
        if (!isValidPhone(text)) return ctx.reply("Неверный формат телефона. Введите +79991234567:");
        const phone = normalizePhone(text);
        let list = [];
        try {
          list = await getAppointmentsByPhone(phone);
        } catch (e) {
          console.error("list_by_phone error:", e.message);
          return ctx.reply("Не удалось получить записи. Попробуйте позже.", mainMenu());
        }
        setState(userId, States.CANCEL_LIST, { phone });
        if (!list.length) return ctx.reply("Активных записей на этот номер не найдено.", mainMenu());
        return ctx.reply("Ваши активные записи. Выберите для отмены:", cancelListKeyboard(list));
      }
      default:
        return ctx.reply(
          "Я не совсем понял. Можно записаться, отменить запись или узнать цены — кнопками ниже.",
          mainMenu()
        );
    }
  });

  console.log("✅ Все обработчики зарегистрированы");
  return bot;
}
