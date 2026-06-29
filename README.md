# Beauty Salon Telegram Bot

Telegram bot для управления записями в салон красоты с функциями бронирования и отмены.

## Развертывание на Render

### Шаг 1: Подготовка
1. Убедитесь, что ваш код находится в GitHub репозитории
2. Если нет - создайте новый репозиторий:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/beauty-salon-bot.git
git push -u origin main
```

### Шаг 2: Создание сервиса на Render
1. Перейдите на [render.com](https://render.com)
2. Создайте аккаунт или войдите
3. Нажмите "New" → "Web Service"
4. Выберите ваш GitHub репозиторий
5. Заполните параметры:
   - **Name**: beauty-salon-telegram-bot
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
   - **Plan**: Free (или платный для лучшей надежности)

### Шаг 3: Настройка переменных окружения
В разделе "Environment" добавьте:
- `BOT_TOKEN`: ваш токен от @BotFather
- `SUPABASE_URL`: URL вашего Supabase проекта
- `SUPABASE_ANON_KEY`: ваш Supabase анон-ключ

### Шаг 4: Развертывание
Нажмите "Create Web Service" - Render автоматически задеплоит приложение.

### Проверка статуса
- Перейдите на Dashboard вашего сервиса
- Проверьте логи в разделе "Logs"
- Найдите сообщение "✅ Bot started successfully!" или похожее

## Локальное развертывание

```bash
# Установка зависимостей
npm install

# Запуск в dev режиме
npm run dev

# Запуск в production режиме
npm start
```

## Структура проекта

```
project/
├── src/
│   ├── index.js          # Entry point
│   ├── bot.js            # Telegram bot handlers
│   ├── fsm.js            # State management
│   ├── keyboards.js      # UI keyboards
│   ├── data.js           # Business data
│   ├── ai.js             # Intent classification
│   └── appointments.js   # Appointments API
├── supabase/
│   └── functions/        # Edge Functions
├── .env                  # Environment variables (не коммитить!)
├── .env.example          # Template for .env
└── package.json
```

## Возможные проблемы

### Ошибка "ETIMEDOUT" при подключении к Telegram
Render может требовать специального конфигурирования для доступа к Telegram API. 
Попробуйте использовать платный план или свяжитесь с поддержкой Render.

### Бот не отвечает
1. Проверьте логи на Render Dashboard
2. Убедитесь, что BOT_TOKEN верный
3. Убедитесь, что环境变量 установлены корректно

## Авторазвертывание
Render автоматически пересчитает приложение при пушах на GitHub.
