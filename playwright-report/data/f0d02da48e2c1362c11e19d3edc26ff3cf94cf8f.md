# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking.spec.ts >> Запись в салон >> 5. Выбор времени
- Location: tests\booking.spec.ts:79:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const SERVICE_LABEL = 'Женская стрижка — 2500 ₽';
  4   | const SECOND_SERVICE_LABEL = 'Маникюр + покрытие — 2000 ₽';
  5   | const MASTER_OK = 'Анна';
  6   | const MASTER_BAD = 'Елена';
  7   | const TIME_SLOT = '10:00';
  8   | 
  9   | async function startBooking(page) {
> 10  |   await page.goto('/');
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
  11  |   await page.getByRole('button', { name: /Записаться/ }).click();
  12  |   await expect(page.getByText('Выберите услугу')).toBeVisible();
  13  | }
  14  | 
  15  | async function chooseService(page, service = SERVICE_LABEL) {
  16  |   await startBooking(page);
  17  |   await page.getByRole('button', { name: service }).click();
  18  |   await expect(page.getByText('Выберите мастера')).toBeVisible();
  19  | }
  20  | 
  21  | async function chooseMaster(page, master = MASTER_OK) {
  22  |   await chooseService(page);
  23  |   await page.getByRole('button', { name: master }).click();
  24  |   await expect(page.getByText('Выберите дату')).toBeVisible();
  25  | }
  26  | 
  27  | async function chooseDate(page) {
  28  |   const dateButton = page.locator('button').filter({ hasText: /\d+\s/ }).first();
  29  |   await expect(dateButton).toBeVisible();
  30  |   await dateButton.click();
  31  |   await expect(page.getByText('Выберите время')).toBeVisible();
  32  | }
  33  | 
  34  | async function chooseTime(page, time = TIME_SLOT) {
  35  |   await page.getByRole('button', { name: time }).click();
  36  |   await expect(page.getByText('Введите ваше имя текстом:')).toBeVisible();
  37  | }
  38  | 
  39  | async function enterNameAndPhone(page) {
  40  |   await page.fill('input[name="name"]', 'Иван Петров').catch(() => {});
  41  |   await page.keyboard.press('Enter');
  42  |   await expect(page.getByText(/Введите номер телефона/)).toBeVisible();
  43  |   await page.fill('input[name="phone"]', '+79991234567').catch(() => {});
  44  |   await page.keyboard.press('Enter');
  45  | }
  46  | 
  47  | async function confirmBooking(page) {
  48  |   await page.getByRole('button', { name: /Подтвердить/ }).click();
  49  | }
  50  | 
  51  | async function createAppointment(page) {
  52  |   await chooseMaster(page);
  53  |   await chooseDate(page);
  54  |   await chooseTime(page);
  55  |   await enterNameAndPhone(page);
  56  |   await confirmBooking(page);
  57  | }
  58  | 
  59  | test.describe('Запись в салон', () => {
  60  |   test('1. /start открывает главное меню', async ({ page }) => {
  61  |     await page.goto('/');
  62  |     await expect(page.getByText('💅 Записаться')).toBeVisible();
  63  |     await expect(page.getByText('❌ Отменить запись')).toBeVisible();
  64  |   });
  65  | 
  66  |   test('2. Выбор услуги', async ({ page }) => {
  67  |     await startBooking(page);
  68  |     await expect(page.getByRole('button', { name: SERVICE_LABEL })).toBeVisible();
  69  |   });
  70  | 
  71  |   test('3. Выбор мастера', async ({ page }) => {
  72  |     await chooseService(page);
  73  |   });
  74  | 
  75  |   test('4. Выбор даты', async ({ page }) => {
  76  |     await chooseMaster(page);
  77  |   });
  78  | 
  79  |   test('5. Выбор времени', async ({ page }) => {
  80  |     await chooseMaster(page);
  81  |     await chooseDate(page);
  82  |   });
  83  | 
  84  |   test('6. Ввод имени', async ({ page }) => {
  85  |     await chooseMaster(page);
  86  |     await chooseDate(page);
  87  |     await chooseTime(page);
  88  |   });
  89  | 
  90  |   test('7. Ввод телефона', async ({ page }) => {
  91  |     await chooseMaster(page);
  92  |     await chooseDate(page);
  93  |     await chooseTime(page);
  94  |     await enterNameAndPhone(page);
  95  |   });
  96  | 
  97  |   test('8. Подтверждение записи', async ({ page }) => {
  98  |     await chooseMaster(page);
  99  |     await chooseDate(page);
  100 |     await chooseTime(page);
  101 |     await enterNameAndPhone(page);
  102 |     await expect(page.getByRole('button', { name: /Подтвердить/ })).toBeVisible();
  103 |   });
  104 | 
  105 |   test('9. Успешное сохранение записи', async ({ page }) => {
  106 |     await createAppointment(page);
  107 |     await expect(page.getByText(/Вы записаны|Запись оформлена|Номер записи/)).toBeVisible();
  108 |   });
  109 | 
  110 |   test('10. Отмена записи', async ({ page }) => {
```