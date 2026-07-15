import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  normalizePhone,
  isValidPhone,
  createAppointment,
  getAvailableTimeSlots,
  getAppointmentsByPhone,
  cancelAppointment,
} from '../src/appointments.js';
import {
  serviceById,
  masterById,
  mastersForService,
  getAvailableDates,
  TIME_SLOTS,
} from '../src/data.js';
import { getState, getContext, setState, reset, States } from '../src/fsm.js';
import {
  mainMenu,
  timeKeyboard,
  cancelListKeyboard,
  backHomeKeyboard,
} from '../src/keyboards.js';

const TEST_USER_ID = 123456;

describe('appointments utilities', () => {
  it('normalizes phone numbers to +7 format', () => {
    assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
    assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567');
    assert.equal(normalizePhone('9991234567'), '+79991234567');
  });

  it('validates russian phone numbers correctly', () => {
    assert.equal(isValidPhone('8 (999) 123-45-67'), true);
    assert.equal(isValidPhone('+7 999 123 45 67'), true);
    assert.equal(isValidPhone('9991234567'), true);
    assert.equal(isValidPhone('123'), false);
    assert.equal(isValidPhone(''), false);
  });
});

describe('business data', () => {
  it('finds services and masters by id', () => {
    const haircut = serviceById('haircut');
    assert.ok(haircut);
    assert.equal(haircut.title, 'Женская стрижка');

    const anna = masterById('anna');
    assert.ok(anna);
    assert.equal(anna.name, 'Анна');
  });

  it('returns masters available for a service', () => {
    const masters = mastersForService('haircut');
    assert.ok(Array.isArray(masters));
    assert.equal(masters.some((m) => m.id === 'anna'), true);
    assert.equal(masters.some((m) => m.id === 'marina'), true);
  });

  it('does not include Mondays in available dates', () => {
    const dates = getAvailableDates(14);
    assert.ok(Array.isArray(dates));
    assert.ok(dates.length > 0);
    for (const date of dates) {
      const dt = new Date(date.id + 'T00:00:00Z');
      assert.notEqual(dt.getUTCDay(), 1, 'Monday should be excluded from available dates');
    }
  });
});

describe('FSM state machine', () => {
  beforeEach(() => {
    reset(TEST_USER_ID);
  });

  it('stores and retrieves state and context', () => {
    setState(TEST_USER_ID, States.CHOOSING_MASTER, { serviceId: 'haircut' });
    assert.equal(getState(TEST_USER_ID), States.CHOOSING_MASTER);
    assert.deepEqual(getContext(TEST_USER_ID), { serviceId: 'haircut' });
  });

  it('resets the user session', () => {
    setState(TEST_USER_ID, States.CHOOSING_MASTER, { serviceId: 'haircut' });
    reset(TEST_USER_ID);
    assert.equal(getState(TEST_USER_ID), States.START);
    assert.deepEqual(getContext(TEST_USER_ID), {});
  });
});

describe('keyboard generation', () => {
  it('builds a time keyboard only for available slots', () => {
    const keyboard = timeKeyboard(['10:00', '11:30']);
    assert.ok(keyboard);
    assert.ok(Array.isArray(keyboard.reply_markup.inline_keyboard));
    assert.equal(keyboard.reply_markup.inline_keyboard[0][0].text, '10:00');
    assert.equal(keyboard.reply_markup.inline_keyboard[1][0].text, '11:30');
  });

  it('builds the main menu keyboard', () => {
    const keyboard = mainMenu();
    assert.ok(Array.isArray(keyboard.reply_markup.inline_keyboard));
    assert.equal(keyboard.reply_markup.inline_keyboard.length, 3);
    assert.equal(keyboard.reply_markup.inline_keyboard[0][0].text, '💅 Записаться');
  });

  it('builds a cancel list keyboard with service and master labels', () => {
    const list = [
      {
        id: 'appt1',
        serviceId: 'haircut',
        masterId: 'anna',
        date: '2026-07-20',
        time: '10:00',
      },
    ];
    const keyboard = cancelListKeyboard(list);
    assert.ok(Array.isArray(keyboard.reply_markup.inline_keyboard));
    assert.equal(keyboard.reply_markup.inline_keyboard[0][0].callback_data, 'cancel:pick:appt1');
    assert.equal(keyboard.reply_markup.inline_keyboard[0][0].text, '2026-07-20 10:00 • Женская стрижка • Анна');
  });

  it('builds back home keyboard', () => {
    const keyboard = backHomeKeyboard();
    assert.ok(Array.isArray(keyboard.reply_markup.inline_keyboard));
    assert.equal(keyboard.reply_markup.inline_keyboard[0][0].text, '← В меню');
  });
});

let fetchCalls = [];
const originalFetch = globalThis.fetch;

describe('appointments edge client', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.com';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    fetchCalls = [];
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      fetchCalls.push({ url, opts: { ...opts, body } });
      switch (body.action) {
        case 'ensure_header':
          return { ok: true, json: async () => ({}) };
        case 'list_available_slots':
          return { ok: true, json: async () => ({ availableSlots: ['10:00', '11:30'] }) };
        case 'list_by_phone':
          return {
            ok: true,
            json: async () => ({
              appointments: [
                {
                  id: 'a1',
                  service_id: 'haircut',
                  service_title: 'Женская стрижка',
                  master_id: 'anna',
                  master_name: 'Анна',
                  date: '2026-07-20',
                  time: '10:00',
                },
              ],
            }),
          };
        case 'cancel':
          return { ok: true, json: async () => ({}) };
        case 'create':
          return {
            ok: true,
            json: async () => ({
              appointment: {
                master_id: body.appointment.master_id,
                master_name: body.appointment.master_name,
              },
            }),
          };
        default:
          return { ok: false, json: async () => ({ error: 'Unknown action' }) };
      }
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches available time slots from edge function', async () => {
    const slots = await getAvailableTimeSlots('haircut', 'anna', '2026-07-20');
    assert.deepEqual(slots, ['10:00', '11:30']);
    assert.equal(fetchCalls.at(-1).opts.body.action, 'list_available_slots');
    assert.equal(fetchCalls.at(-1).opts.body.service_id, 'haircut');
  });

  it('lists appointments by normalized phone', async () => {
    const list = await getAppointmentsByPhone('89991234567');
    assert.equal(list.length, 1);
    assert.equal(list[0].serviceId, 'haircut');
    assert.equal(fetchCalls.at(-1).opts.body.phone, '+79991234567');
  });

  it('cancels appointment with normalized phone', async () => {
    const result = await cancelAppointment('a1', '+7 (999) 123-45-67');
    assert.deepEqual(result, { id: 'a1', status: 'cancelled' });
    assert.equal(fetchCalls.at(-1).opts.body.action, 'cancel');
    assert.equal(fetchCalls.at(-1).opts.body.phone, '+79991234567');
  });

  it('creates an appointment and returns active status', async () => {
    const appointment = await createAppointment({
      id: 'appt1',
      serviceId: 'haircut',
      serviceTitle: 'Женская стрижка',
      masterId: 'anna',
      masterName: 'Анна',
      date: '2026-07-20',
      time: '10:00',
      name: 'Мария',
      phone: '+7 999 123 45 67',
      telegramUserId: 123,
    });
    assert.equal(appointment.id, 'appt1');
    assert.equal(appointment.status, 'active');
    assert.equal(appointment.masterName, 'Анна');
    assert.equal(fetchCalls.at(-1).opts.body.action, 'create');
    assert.equal(fetchCalls.at(-1).opts.body.appointment.client_name, 'Мария');
  });
});
