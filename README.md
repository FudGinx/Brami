# Брами та дворики

Настільна гра про реставрацію дверей українських міст. Онлайн-кімнати за кодом.

Render: **New → Web Service** → цей репозиторій → Build Command `npm install`, Start Command `npm start`.

## Арт

Покладіть PNG у теки `art/parts`, `art/walls`, `art/cards`, `art/ui` і запустіть:

```
python3 tools_add_art.py шлях/до/теки_з_art
```

Скрипт стискає картинки у WebP, обрізає прозорі поля в деталей, сам знаходить отвір дверей на стінах і оновлює `public/art/manifest.json`. Чого ще немає — гра малює сама.
