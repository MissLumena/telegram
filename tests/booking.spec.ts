import { test, expect } from '@playwright/test';

const SERVICE_LABEL = 'Женская стрижка — 2500 ₽';
const SECOND_SERVICE_LABEL = 'Маникюр + покрытие — 2000 ₽';
const MASTER_OK = 'Анна';
const MASTER_BAD = 'Елена';
const TIME_SLOT = '10:00';

async function startBooking(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Записаться/ }).click();
  await expect(page.getByText('Выберите услугу')).toBeVisible();
}

async function chooseService(page, service = SERVICE_LABEL) {
  await startBooking(page);
  await page.getByRole('button', { name: service }).click();
  await expect(page.getByText('Выберите мастера')).toBeVisible();
}

async function chooseMaster(page, master = MASTER_OK) {
  await chooseService(page);
  await page.getByRole('button', { name: master }).click();
  await expect(page.getByText('Выберите дату')).toBeVisible();
}

async function chooseDate(page) {
  const dateButton = page.locator('button').filter({ hasText: /\d+\s/ }).first();
  await expect(dateButton).toBeVisible();
  await dateButton.click();
  await expect(page.getByText('Выберите время')).toBeVisible();
}

async function chooseTime(page, time = TIME_SLOT) {
  await page.getByRole('button', { name: time }).click();
  await expect(page.getByText('Введите ваше имя текстом:')).toBeVisible();
}

async function enterNameAndPhone(page) {
  await page.fill('input[name="name"]', 'Иван Петров').catch(() => {});
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Введите номер телефона/)).toBeVisible();
  await page.fill('input[name="phone"]', '+79991234567').catch(() => {});
  await page.keyboard.press('Enter');
}

async function confirmBooking(page) {
  await page.getByRole('button', { name: /Подтвердить/ }).click();
}

async function createAppointment(page) {
  await chooseMaster(page);
  await chooseDate(page);
  await chooseTime(page);
  await enterNameAndPhone(page);
  await confirmBooking(page);
}

test.describe('Запись в салон', () => {
  test('1. /start открывает главное меню', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('💅 Записаться')).toBeVisible();
    await expect(page.getByText('❌ Отменить запись')).toBeVisible();
  });

  test('2. Выбор услуги', async ({ page }) => {
    await startBooking(page);
    await expect(page.getByRole('button', { name: SERVICE_LABEL })).toBeVisible();
  });

  test('3. Выбор мастера', async ({ page }) => {
    await chooseService(page);
  });

  test('4. Выбор даты', async ({ page }) => {
    await chooseMaster(page);
  });

  test('5. Выбор времени', async ({ page }) => {
    await chooseMaster(page);
    await chooseDate(page);
  });

  test('6. Ввод имени', async ({ page }) => {
    await chooseMaster(page);
    await chooseDate(page);
    await chooseTime(page);
  });

  test('7. Ввод телефона', async ({ page }) => {
    await chooseMaster(page);
    await chooseDate(page);
    await chooseTime(page);
    await enterNameAndPhone(page);
  });

  test('8. Подтверждение записи', async ({ page }) => {
    await chooseMaster(page);
    await chooseDate(page);
    await chooseTime(page);
    await enterNameAndPhone(page);
    await expect(page.getByRole('button', { name: /Подтвердить/ })).toBeVisible();
  });

  test('9. Успешное сохранение записи', async ({ page }) => {
    await createAppointment(page);
    await expect(page.getByText(/Вы записаны|Запись оформлена|Номер записи/)).toBeVisible();
  });

  test('10. Отмена записи', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Отменить запись/ }).click();
    await expect(page.getByText(/Введите ваш номер телефона/)).toBeVisible();
  });

  test('11. Нельзя записать двух клиентов к одному мастеру в одно и то же время', async ({ page }) => {
    await createAppointment(page);
    await chooseMaster(page);
    await chooseDate(page);
    await chooseTime(page);
    await page.fill('input[name="name"]', 'Мария Иванова').catch(() => {});
    await page.keyboard.press('Enter');
    await page.fill('input[name="phone"]', '+79990001122').catch(() => {});
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /Подтвердить/ }).click();
    await expect(page.getByText(/слот.*занят|нет свободных слотов|slot unavailable/i)).toBeVisible();
  });

  test('12. Нельзя записать клиента к мастеру, который не оказывает выбранную услугу', async ({ page }) => {
    await startBooking(page);
    await page.getByRole('button', { name: SERVICE_LABEL }).click();
    await expect(page.getByRole('button', { name: MASTER_BAD })).toHaveCount(0);
  });

  test('13. Запись на услугу доступна только в рабочие часы салона', async ({ page }) => {
    await chooseMaster(page);
    await chooseDate(page);
    await expect(page.getByRole('button', { name: '09:00' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '21:00' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: TIME_SLOT })).toBeVisible();
  });

  test('14. Запись на прошлую дату — ошибка', async ({ page }) => {
    await chooseMaster(page);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayLabel = yesterday.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
    await expect(page.getByText(yesterdayLabel)).toHaveCount(0);
  });
});
