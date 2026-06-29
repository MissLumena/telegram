import { Markup } from "telegraf";
import {
  SERVICES,
  mastersForService,
  getAvailableDates,
  TIME_SLOTS,
  masterById,
  serviceById,
} from "./data.js";

export const mainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("💅 Записаться", "book:start")],
    [Markup.button.callback("❌ Отменить запись", "cancel:start")],
    [Markup.button.callback("ℹ️ Цены и адрес", "faq:info")],
  ]);

export const serviceKeyboard = () =>
  Markup.inlineKeyboard([
    ...SERVICES.map((s) => [Markup.button.callback(`${s.title} — ${s.price} ₽`, `book:svc:${s.id}`)]),
    [Markup.button.callback("← В меню", "nav:home")],
  ]);

export const masterKeyboard = (serviceId) => {
  const masters = mastersForService(serviceId);
  const rows = masters.map((m) => [Markup.button.callback(m.name, `book:mst:${m.id}`)]);
  rows.push([Markup.button.callback("Любой мастер", `book:mst:any`)]);
  rows.push([Markup.button.callback("← Назад", "book:back:svc")]);
  return Markup.inlineKeyboard(rows);
};

export const dateKeyboard = () => {
  const dates = getAvailableDates();
  const rows = [];
  for (let i = 0; i < dates.length; i += 2) {
    rows.push(dates.slice(i, i + 2).map((d) => Markup.button.callback(d.label, `book:date:${d.id}`)));
  }
  rows.push([Markup.button.callback("← Назад", "book:back:mst")]);
  return Markup.inlineKeyboard(rows);
};

export const timeKeyboard = () =>
  Markup.inlineKeyboard([
    ...TIME_SLOTS.map((t) => [Markup.button.callback(t, `book:time:${t}`)]),
    [Markup.button.callback("← Назад", "book:back:date")],
  ]);

export const confirmKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("✅ Подтвердить", "book:confirm"), Markup.button.callback("❌ Отмена", "book:abort")],
  ]);

export const cancelListKeyboard = (list) => {
  const rows = list.map((a) => {
    const svc = serviceById(a.serviceId)?.title ?? a.serviceId;
    const mst = a.masterId === "any" ? "Любой мастер" : masterById(a.masterId)?.name ?? a.masterId;
    return [Markup.button.callback(`${a.date} ${a.time} • ${svc} • ${mst}`, `cancel:pick:${a.id}`)];
  });
  rows.push([Markup.button.callback("← В меню", "nav:home")]);
  return Markup.inlineKeyboard(rows);
};

export const cancelConfirmKeyboard = (id) =>
  Markup.inlineKeyboard([
    [Markup.button.callback("Да, отменить", `cancel:yes:${id}`), Markup.button.callback("Нет", "cancel:no")],
  ]);

export const backHomeKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback("← В меню", "nav:home")]]);
