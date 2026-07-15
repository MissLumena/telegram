import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.2";
import { JWT } from "npm:google-auth-library@9.0.0";

const SPREADSHEET_ID = Deno.env.get("SPREADSHEET_ID") ?? "";
const GOOGLE_SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") ?? "";
const GOOGLE_PRIVATE_KEY = (Deno.env.get("GOOGLE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");

const HEADERS = [
  "id",
  "created_at",
  "service_id",
  "service_title",
  "master_id",
  "master_name",
  "date",
  "time",
  "client_name",
  "phone",
  "telegram_user_id",
  "status",
];

function normalizePhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) return "+7" + digits.slice(1);
  if (digits.length === 10) return "+7" + digits;
  return "+" + digits;
}

const TIME_SLOTS = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];

const MASTERS = [
  { id: "anna", name: "Анна", services: ["haircut", "coloring"] },
  { id: "elena", name: "Елена", services: ["manicure", "pedicure"] },
  { id: "olga", name: "Ольга", services: ["brows", "manicure"] },
  { id: "marina", name: "Марина", services: ["haircut", "coloring", "brows"] },
];

function mastersForService(serviceId) {
  return MASTERS.filter((master) => master.services.includes(serviceId));
}

async function getSheet() {
  const jwt = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, jwt);
  await doc.loadInfo();
  return doc.sheetsByIndex[0];
}

serve(async (req) => {
  try {
    // Read raw body so we can log it even if parsing fails
    const raw = await req.text().catch(() => "");
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("sheets-appointments: invalid JSON body:", raw);
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { action } = body;
    console.log("sheets-appointments: received request", {
      action,
      hasSpreadsheetId: !!SPREADSHEET_ID,
      hasGoogleEmail: !!GOOGLE_SERVICE_ACCOUNT_EMAIL,
    });
    console.log("sheets-appointments: body", body);

    // Ensure sheet only when needed to avoid failing early before logging
    if (action === "ensure_header") {
      const sheet = await getSheet();
      const rows = await sheet.getRows({ limit: 1 });
      if (rows.length === 0) {
        await sheet.setHeaderRow(HEADERS);
      }
      return Response.json({ ok: true });
    }

    if (action === "list_available_slots") {
      const { date, service_id, master_id } = body;
      console.log("list_available_slots params", { date, service_id, master_id });
      if (!date) {
        return Response.json({ error: "date is required" }, { status: 400 });
      }
      const sheet = await getSheet();
      const rows = await sheet.getRows();
      const active = rows.filter((row) => row.get("status") === "active");

      const availableSlots = TIME_SLOTS.filter((time) => {
        if (master_id && master_id !== "any") {
          return !active.some(
            (row) => row.get("date") === date && row.get("time") === time && row.get("master_id") === master_id
          );
        }

        const eligibleMasters = service_id ? mastersForService(service_id) : MASTERS;
        return eligibleMasters.some(
          (master) => !active.some(
            (row) => row.get("date") === date && row.get("time") === time && row.get("master_id") === master.id
          )
        );
      });

      console.log("availableSlots computed", { date, availableSlots });
      return Response.json({ availableSlots });
    }

    if (action === "create") {
      const a = body.appointment;
      console.log("create appointment payload", a);
      if (!a || !a.date || !a.time || !a.service_id) {
        return Response.json({ error: "Invalid appointment payload" }, { status: 400 });
      }
      const sheet = await getSheet();
      const rows = await sheet.getRows();
      const active = rows.filter((row) => row.get("status") === "active");

      if (a.master_id === "any") {
        const eligibleMasters = mastersForService(a.service_id);
        const bookedIds = new Set(
          active
            .filter((row) => row.get("date") === a.date && row.get("time") === a.time)
            .map((row) => row.get("master_id"))
        );
        const freeMaster = eligibleMasters.find((master) => !bookedIds.has(master.id));
        if (!freeMaster) {
          console.log("create: no free master", { eligibleMasters, bookedIds: Array.from(bookedIds) });
          return Response.json({ error: "slot unavailable" }, { status: 409 });
        }
        a.master_id = freeMaster.id;
        a.master_name = freeMaster.name;
      } else {
        const slotTaken = active.some(
          (row) => row.get("date") === a.date && row.get("time") === a.time && row.get("master_id") === a.master_id
        );
        if (slotTaken) {
          console.log("create: slot already taken", { a });
          return Response.json({ error: "slot unavailable" }, { status: 409 });
        }
      }

      await sheet.addRow({ ...a, status: "active" });
      console.log("create: appointment saved", { id: a.id });
      return Response.json({ ok: true, appointment: { ...a } });
    }

    if (action === "list_by_phone") {
      const phoneRaw = body.phone;
      const phone = normalizePhone(phoneRaw);
      console.log("list_by_phone for", phoneRaw, "->", phone);
      const sheet = await getSheet();
      const rows = await sheet.getRows();
      const appointments = rows
        .filter((row) => normalizePhone(row.get("phone")) === phone && row.get("status") === "active")
        .map((row) => ({
          id: row.get("id"),
          service_id: row.get("service_id"),
          service_title: row.get("service_title"),
          master_id: row.get("master_id"),
          master_name: row.get("master_name"),
          date: row.get("date"),
          time: row.get("time"),
        }));
      console.log("list_by_phone found", appointments.length, "appointments");
      return Response.json({ appointments });
    }

    if (action === "cancel") {
      const phone = normalizePhone(body.phone);
      console.log("cancel request", { id: body.id, phone });
      const sheet = await getSheet();
      const rows = await sheet.getRows();
      const row = rows.find(
        (row) => row.get("id") === body.id && normalizePhone(row.get("phone")) === phone
      );
      if (!row) {
        console.log("cancel: not found", { id: body.id, phone });
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      row.set("status", "cancelled");
      await row.save();
      console.log("cancel: success", { id: body.id });
      return Response.json({ ok: true });
    }

    console.error("Unknown action", body);
    return Response.json({ error: "Unknown action", received: body }, { status: 400 });
  } catch (e) {
    console.error("sheets-appointments: uncaught error", e?.stack ?? e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
