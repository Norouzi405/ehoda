# خانواده و رسانه (Family & Media)

پلتفرم جامعه‌محور پرسش‌وپاسخ + محتوای مرجع سواد رسانه‌ای برای والدین، مربیان و متخصصان — با نظارت چندسطحی، رتبه‌بندی پاسخ بر اساس اعتبار علمی، و ابزارهای تولید PDF فارسی.

> **وضعیت فعلی: فاز ۱ (ماژول محتوا + احراز هویت/OTP) تکمیل و به‌صورت end-to-end روی D1 محلی تأیید شده — در انتظار بازبینی بصری کارفرما پیش از شروع فاز ۲**

---

## ۱. معماری فنی

پروژه بر پایه یک اسکلت **Cloudflare-native** ساخته شده (طبق تأیید کارفرما در جایگزینی بند ۶.۱ سند اصلی):

| لایه | فناوری |
|---|---|
| Runtime / API | Cloudflare Workers + [Hono](https://hono.dev) |
| دیتابیس رابطه‌ای | Cloudflare D1 (SQLite-compatible) از طریق [Drizzle ORM](https://orm.drizzle.team) |
| فضای ذخیره فایل | Cloudflare R2 (برای PDFهای خروجی) |
| تولید PDF | Cloudflare Browser Rendering (REST API) — با فونت فارسی Vazirmatn |
| پیامک OTP | کاوه‌نگار (Kavenegar) از طریق الگوی Adapter (+ Mock برای توسعه) |
| کپچا | Cloudflare Turnstile (برنامه‌ریزی‌شده) |
| CI/CD | GitHub Actions (تست خودکار + دیپلوی BYOK) |

جزئیات کامل معماری، تصمیمات فنی و دلایل جایگزینی در پوشه [`docs/`](./docs) مستند شده است.

### اصل حیاتی: طراحی قابل مهاجرت (Portability)
تمام کد بر اساس هفت اصل «آماده برای مهاجرت به VPS/Laravel/Postgres» نوشته شده است (نگاه کنید به `docs/decisions.md` § D-007 و `docs/migration-guide-to-vps.md`):
- لایه‌بندی سخت: Routes → Services (بدون وابستگی به Cloudflare) → Repositories (فقط Drizzle) → Adapters
- مدل داده هم‌خوان با PostgreSQL/MySQL (بدون رفتار اختصاصی SQLite)
- اندپوینت پیش‌بینی‌شده `/admin/export/backup` برای خروجی کامل JSON/SQL
- مستندسازی OpenAPI-style در `docs/api.md`
- الگوی Adapter برای هر سرویس بیرونی (SMS، Storage، PDF)
- تست‌های خودکار Vitest روی منطق حیاتی، اجرا در هر PR/Push از طریق GitHub Actions

---

## ۲. وضعیت فعلی — فاز ۱ تکمیل شد

### Gate Check (چک‌پوینت اول) — تکمیل شده در نشست قبل:

- [x] اسکلت کامل پروژه Hono + Drizzle + D1 (لایه‌بندی Routes/Services/Repositories/Adapters)
- [x] مدل داده کامل (۳۷ جدول در ۷ فایل دومینی) + Migration اولیه (`migrations/0000_past_archangel.sql`)
- [x] لایه Adapter برای SMS (کاوه‌نگار + Mock)، Storage (R2 + لینک امضاشده)، PDF (Browser Rendering)
- [x] سرویس قالب HTML فارسی راست‌چین برای PDF (فونت Vazirmatn)
- [x] اندپوینت اثبات فنی PDF: `GET /api/_gatecheck/pdf-sample`
- [x] نمونه کامل RBAC (Repository → Service → Middleware) + سرویس رتبه‌بندی ۴ سطحی پاسخ‌ها
- [x] GitHub Actions: فایل‌های CI/Deploy تهیه شده (⚠️ هنوز Push نشده — نگاه کنید به بخش ۷)

### فاز ۱ — ماژول محتوا و صفحات عمومی + احراز هویت/OTP — تکمیل شده در این نشست:

**ماژول محتوا:**
- [x] Repository/Service/API برای محتوا (`GET /api/contents`, `/api/contents/:slug`, `/api/categories`) با فیلتر دسته‌بندی، صفحه‌بندی، و فیلدهای SEO
- [x] صفحات SSR عمومی: `/contents` (لیست + فیلتر دسته)، `/contents/:slug` (جزئیات مقاله)، صفحه اصلی با آخرین مقالات
- [x] Seeder: ۵ مقاله نمونه فارسی (یکی از هر دسته اصلی: کودک-و-رسانه ×۲، زوجین-و-رسانه، مربی-و-مدرسه، سواد-رسانه‌ای)

**احراز هویت و OTP:**
- [x] `sessions` table جدید + ستون `otp_tokens.request_id` (Migration `0001_secret_prima.sql`)
- [x] `CaptchaAdapter` (Turnstile واقعی + Mock توسعه) با همان الگوی SmsAdapter
- [x] کتابخانه‌های Crypto (فقط Web Crypto API — بدون تغییر در مهاجرت به VPS/Node) و نرمال‌سازی شماره موبایل ایرانی
- [x] `OtpService` (محدودیت نرخ ۳ تلاش/۱۰دقیقه، Cooldown ۶۰ ثانیه، انقضا ۲ دقیقه، قفل بعد از ۵ تلاش اشتباه) و `AuthService` (Session، ایجاد/یافتن کاربر)
- [x] مسیرهای API: `POST /api/auth/otp/request`, `/otp/verify`, `POST /api/auth/logout`, `GET /api/auth/me`
- [x] صفحه SSR ورود دو مرحله‌ای (`/login`) با ویجت Turnstile + JS پیشرونده (بدون SPA framework)
- [x] **۲۶ تست جدید Vitest** (مجموع ۳۵ تست، همگی موفق) روی OtpService، AuthService، نرمال‌سازی شماره
- [x] **تأیید end-to-end روی D1 محلی واقعی**: Migration + Seed اجرا شد، همه مسیرها (خانه، لیست/جزئیات مقاله، ورود، APIها) HTTP 200 برگرداندند، و جریان کامل OTP (درخواست → کد Mock → تأیید → Session Cookie → `/auth/me`) با موفقیت تست شد.

آنچه **باقی مانده / در انتظار** (تفصیل در بخش ۷):

- [ ] Push نهایی به GitHub (مسدود شده توسط محدودیت مجوز `workflows` در توکن GitHub App)
- [ ] تکمیل فاز ۳ (کتابخانه ابزار + `/admin/export/backup`) — هنوز شروع نشده
- [ ] تأیید **بصری** خروجی PDF فارسی — نیازمند توکن واقعی Cloudflare کارفرما

---

## ۳. راه‌اندازی محلی (Development)

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs   # یا: npm run dev:sandbox
curl http://localhost:3000/
curl http://localhost:3000/api/_gatecheck/pdf-sample -o sample.pdf
```

برای اتصال به D1 محلی و اجرای Migration:

```bash
npm run db:migrate:local
npm run db:seed:local
```

برای اجرای تست‌ها:

```bash
npm run test
```

متغیرهای محیطی لازم (نگاه کنید به `.dev.vars.example`): `SMS_PROVIDER`, `KAVENEGAR_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, `FILE_SIGN_SECRET`.

> ⚠️ نکته مهم Persistence محلی D1: تمام دستورات D1 محلی (migrate/seed/console) **و** دستور `wrangler pages dev` داخل `ecosystem.config.cjs` باید دقیقاً یک مقدار مشترک `--persist-to=.wrangler/state` داشته باشند، وگرنه CLI مایگریشن و سرور dev به دو فایل SQLite متفاوت اشاره می‌کنند (نگاه کنید به `docs/decisions.md` § D-011).

---

## ۴. ساختار پروژه

```
src/
  routes/         # HTTP فقط — نازک، بدون منطق تجاری
  services/       # منطق تجاری خالص (بدون import از Cloudflare)
  repositories/    # فقط پرس‌وجوهای Drizzle
  adapters/       # SMS / Storage / PDF — قابل تغییر بدون دست زدن به Services
  db/schema/      # تعریف ۳۷ جدول Drizzle
  lib/            # bindings.ts، context.ts (تزریق وابستگی)
  middleware/     # RBAC و سایر میان‌افزارها
docs/             # مستندات معماری، دیتابیس، نقش‌ها، API، مهاجرت
migrations/       # SQL تولیدشده توسط drizzle-kit
seeders/          # داده اولیه (seed.sql)
tests/            # تست‌های Vitest
```

## ۵. مدل داده و ذخیره‌سازی

- **دیتابیس اصلی**: Cloudflare D1 (SQLite) — ۳۷ جدول شامل کاربران/نقش‌ها، پروفایل‌های تخصصی، محتوای مرجع، پرسش‌ها (با فیلدهای خام و عمومی جدا)، پاسخ‌های درختی (`parent_id`, `root_response_id`, `depth`, `author_level_snapshot`, `is_tombstone`)، ابزارها، اعلان‌ها، لاگ رویداد، تنظیمات.
- **فایل PDF**: Cloudflare R2 با لینک دانلود امضاشده زمان‌دار (HMAC).
- تمام مدل داده با هدف قابلیت ترجمه مستقیم به PostgreSQL طراحی شده (جزئیات در `docs/database-schema.md`).

## ۶. استقرار (Deployment)

- **پلتفرم**: Cloudflare Pages/Workers، حساب اختصاصی کارفرما (BYOK)
- **پیش‌نمایش فعلی (Sandbox، نه استقرار نهایی)**: در حال اجرا در محیط sandbox توسعه — نگاه کنید به گزارش فاز ۱ ارائه‌شده به کارفرما برای لینک زنده.
- **وضعیت استقرار نهایی**: ⏳ در انتظار توکن واقعی Cloudflare کارفرما (`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`) برای دیپلوی و تأیید نهایی PDF
- **تکنولوژی**: Hono + TypeScript + Drizzle ORM + D1 + R2 + Browser Rendering
- **آخرین به‌روزرسانی**: ۱۴۰۵/۰۶/۰۸ (2026-08-30)

## ۷. مسدودیت GitHub Actions (نیازمند اقدام کارفرما)

فایل‌های `.github/workflows/ci.yml` و `.github/workflows/deploy.yml` به دلیل محدودیت سطح پلتفرم GitHub App (نبود مجوز `workflows` روی توکن) قابل Push از این محیط sandbox نیستند — این محدودیت هم در `git push` و هم در تماس مستقیم GitHub REST Contents API تأیید شده و قابل دورزدن از سمت ما نیست. برای فعال‌سازی CI/CD یکی از این دو مسیر لازم است:
1. افزودن مجوز `workflows` به توکن GitHub App نصب‌شده روی مخزن، یا
2. کامیت مستقیم این دو فایل توسط تیم کارفرما (که از قبل در مخزن sandbox موجود و آماده کپی هستند).
