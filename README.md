# СтрумON | Бот ⚡

Telegram-бот для повідомлень про **нові текстові публікації** офіційного Telegram-каналу Хмельницькобленерго. Підготовлений для Vercel + GitHub Actions.

> **Важливо:** ця початкова версія **ще не перевіряє зміни аварійних відключень за конкретною адресою** на hoe.com.ua. Команда /status дає посилання на офіційний адресний сервіс. Не сприймайте повідомлення як підтвердження наявності чи відсутності світла.

## Розгортання

1. Імпортуйте цей GitHub-репозиторій у Vercel як Node.js-проєкт.
2. Створіть Redis у Upstash. Додайте у Vercel Environment Variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
3. Додайте у Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_SECRET`, `CHECK_SECRET`. Значення секретів створіть самостійно. **Не записуйте їх у GitHub-файли.**
4. Зробіть Deploy. Налаштуйте Telegram webhook через метод `setWebhook` на адресу `https://ВАШ-ДОМЕН.vercel.app/api/telegram` із параметром `secret_token`, рівним `WEBHOOK_SECRET`. Використовуйте токен лише в захищеному середовищі.
5. У GitHub → Settings → Secrets and variables → Actions додайте `CHECK_URL` = `https://ВАШ-ДОМЕН.vercel.app/api/check` і `CHECK_SECRET` = такий самий секрет, як у Vercel.
6. У GitHub → Actions вручну запустіть workflow **Check electricity updates**. Перший запуск запам'ятає останню публікацію; наступні надсилатимуть нові релевантні текстові публікації.

Команди: `/start`, `/status`, `/graph`, `/help`.

Планові перевірки GitHub Actions можуть запускатися із затримками. Зображення, адресні аварії та зміни прогнозованого часу відновлення ця версія не обробляє.
