// Hardcoded business data — stands in for the Google Sheets source of truth.
// In production this would be read from Sheets and cached.

export const SERVICES = [
  { id: "haircut", title: "Женская стрижка", durationMin: 60, price: 2500 },
  { id: "coloring", title: "Окрашивание", durationMin: 120, price: 4500 },
  { id: "manicure", title: "Маникюр + покрытие", durationMin: 90, price: 2000 },
  { id: "pedicure", title: "Педикюр", durationMin: 90, price: 2200 },
  { id: "brows", title: "Брови (коррекция + окрашивание)", durationMin: 45, price: 1200 },
];

export const MASTERS = [
  { id: "anna", name: "Анна", services: ["haircut", "coloring"] },
  { id: "elena", name: "Елена", services: ["manicure", "pedicure"] },
  { id: "olga", name: "Ольга", services: ["brows", "manicure"] },
  { id: "marina", name: "Марина", services: ["haircut", "coloring", "brows"] },
];

export const TIME_SLOTS = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];

const TIMEZONE_OFFSET = 3; // Moscow UTC+3

function getMoscowNow() {
  const utc = new Date();
  return new Date(utc.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
}

// Next N days as bookable dates, excluding Mondays (salon closed).
export function getAvailableDates(daysAhead = 14) {
  const out = [];
  const now = getMoscowNow();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 1) continue; // Monday closed
    out.push({
      id: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" }),
    });
  }
  return out;
}

export function getAvailableTimeSlots(dateId) {
  const now = getMoscowNow();
  const todayId = now.toISOString().slice(0, 10);

  if (dateId !== todayId) return TIME_SLOTS;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return TIME_SLOTS.filter((t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m > currentMinutes + 30;
  });
}
\