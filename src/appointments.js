// Appointments store backed by Google Sheets via a Supabase edge function.
// The edge function handles JWT auth to Google Sheets API; this module is a
// thin async client. Phone normalization/validation stays here for input checks.

const EDGE_URL = `${process.env.SUPABASE_URL}/functions/v1/sheets-appointments`;
const EDGE_KEY = process.env.SUPABASE_ANON_KEY;

async function callEdge(body) {
  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EDGE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `Edge function error ${res.status}`);
  }
  return data;
}

let headerInitialized = false;

async function ensureHeader() {
  if (headerInitialized) return;
  try {
    await callEdge({ action: "ensure_header" });
    headerInitialized = true;
  } catch (e) {
    console.error("ensure_header failed:", e.message);
  }
}

export async function createAppointment(data) {
  await ensureHeader();
  const record = {
    id: data.id,
    created_at: data.createdAt ?? new Date().toISOString(),
    service_id: data.serviceId,
    service_title: data.serviceTitle,
    master_id: data.masterId,
    master_name: data.masterName,
    date: data.date,
    time: data.time,
    client_name: data.name,
    phone: data.phone,
    telegram_user_id: data.telegramUserId,
  };
  const response = await callEdge({ action: "create", appointment: record });
  return {
    ...record,
    masterId: response.appointment?.master_id ?? record.master_id,
    masterName: response.appointment?.master_name ?? record.master_name,
    status: "active",
  };
}

export async function getAvailableTimeSlots(serviceId, masterId, date) {
  await ensureHeader();
  const data = await callEdge({ action: "list_available_slots", service_id: serviceId, master_id: masterId, date });
  return Array.isArray(data.availableSlots) ? data.availableSlots : [];
}

export async function getAppointmentsByPhone(phone) {
  await ensureHeader();
  const data = await callEdge({ action: "list_by_phone", phone: normalizePhone(phone) });
  return (data.appointments ?? []).map((a) => ({
    id: a.id,
    serviceId: a.service_id,
    serviceTitle: a.service_title,
    masterId: a.master_id,
    masterName: a.master_name,
    date: a.date,
    time: a.time,
  }));
}

export async function cancelAppointment(id, phone) {
  await ensureHeader();
  await callEdge({ action: "cancel", id, phone: normalizePhone(phone) });
  return { id, status: "cancelled" };
}

export function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) return "+7" + digits.slice(1);
  if (digits.length === 10) return "+7" + digits;
  return "+" + digits;
}

export function isValidPhone(raw) {
  const digits = String(raw).replace(/\D/g, "");
  return (
    (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) || digits.length === 10
  );
}
