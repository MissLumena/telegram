import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { normalizePhone, isValidPhone } from '../src/appointments.js';
import {
  serviceById,
  masterById,
  mastersForService,
  getAvailableDates,
  TIME_SLOTS,
} from '../src/data.js';
import { getState, getContext, setState, reset, States } from '../src/fsm.js';
import { timeKeyboard } from '../src/keyboards.js';

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
});
