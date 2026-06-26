# Cohesive System Startup Checklist

Use this from the root folder:

```powershell
cd "E:\veo 3"
```

## 1. Create `.env`

```powershell
Copy-Item -LiteralPath ".env.example" -Destination ".env"
```

Fill at minimum:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_PRIVATE_KEY_BASE64`
- `JWT_PUBLIC_KEY_BASE64`
- `COOKIE_ENCRYPTION_KEY_BASE64`
- `ALLOWED_EMAIL_DOMAINS`
- `VIRTUAL_EMAIL_DOMAIN`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`

`COOKIE_ENCRYPTION_KEY_BASE64` must decode to exactly 32 bytes.

## 2. Install Dependencies

Backend/root:

```powershell
npm install
```

Landing page:

```powershell
npm --prefix landing install
```

## 3. Start PostgreSQL and Redis

Redis with Docker:

```powershell
docker run --name veo-redis -p 6379:6379 -d redis:7-alpine
```

Verify Redis:

```powershell
npm run redis:ping
```

## 4. Prisma Migration and Seed

```powershell
npm run prisma:migrate
npm run seed
```

The seed creates:

- `SUPER_ADMIN`
- `BASIC`, `PRO`, and `ULTRA` plan configs

## 5. Build Everything

```powershell
npm run build:all
```

This runs:

- backend clean install, build, and tests
- Chrome extension manifest and JavaScript syntax validation
- landing clean install and production build

## 6. Run Locally in Development

Terminal 1, backend:

```powershell
cd "E:\veo 3"
npm run dev
```

Backend URL:

```txt
http://localhost:3000
```

Terminal 2, landing page:

```powershell
cd "E:\veo 3\landing"
npm run dev -- -p 3001
```

Landing URL:

```txt
http://localhost:3001
```

Chrome extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select `E:\veo 3\extension`.
5. In the popup, set backend URL to `http://localhost:3000`.

## 7. Common Windows Notes

- Always quote the root path because it contains a space: `"E:\veo 3"`.
- If PowerShell has trouble launching hidden processes, run dev servers in normal terminals.
- If backend env loading fails, read the clean error output; it prints the exact `.env` path checked.
- PM2 production config is available in `ecosystem.config.cjs`.
