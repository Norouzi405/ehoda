# خانواده و رسانه (Family & Media)

پلتفرم جامعه‌محور پرسش‌وپاسخ + محتوای مرجع سواد رسانه‌ای برای والدین، مربیان و متخصصان — با نظارت چندسطحی، رتبه‌بندی پاسخ بر اساس اعتبار علمی، و ابزارهای تولید PDF فارسی.

> **وضعیت فعلی: Gate Check (چک‌پوینت حیاتی اول) — در انتظار تأیید کارفرما پیش از شروع فاز ۱**

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

## ۲. وضعیت فعلی — Gate Check

طبق دستور کارفرما، پیش از شروع فازهای ۱ تا ۶، این چک‌پوینت باید تأیید شود. آنچه تا این لحظه **تکمیل شده**:

- [x] اسکلت کامل پروژه Hono + Drizzle + D1 (لایه‌بندی Routes/Services/Repositories/Adapters)
- [x] مدل داده کامل (۳۷ جدول در ۷ فایل دومینی) + Migration اولیه (`migrations/0000_past_archangel.sql`)
- [x] لایه Adapter برای SMS (کاوه‌نگار + Mock)، Storage (R2 + لینک امضاشده)، PDF (Browser Rendering)
- [x] سرویس قالب HTML فارسی راست‌چین برای PDF (فونت Vazirmatn)
- [x] اندپوینت اثبات فنی PDF: `GET /api/_gatecheck/pdf-sample`
- [x] نمونه کامل RBAC (Repository → Service → Middleware) + سرویس رتبه‌بندی ۴ سطحی پاسخ‌ها
- [x] ۹ تست خودکار Vitest (RBAC deny-by-default، پایداری رتبه‌بندی در برابر رأی‌سازی) — همگی موفق
- [x] GitHub Actions: CI (build+test) و Deploy (BYOK)
- [x] Seed اولیه: نقش‌ها، مجوزها، دسته‌بندی‌ها، ابزارها، تنظیمات پیش‌فرض
- [x] هشت سند اصلی در `docs/`: architecture, decisions, migration-guide-to-vps, database-schema, roles-and-permissions, question-and-community-workflow, moderation-and-safety, api

آنچه **باقی مانده / در انتظار**:

- [ ] Push نهایی مخزن به GitHub رسمی
- [ ] افزودن ۵ مقاله نمونه + ۵ رشته پرسش‌وپاسخ نمونه به Seed
- [ ] پیاده‌سازی کامل اندپوینت `/admin/export/backup` (فعلاً فقط در اسناد برنامه‌ریزی شده)
- [ ] تأیید **بصری** خروجی PDF فارسی — نیازمند `CLOUDFLARE_ACCOUNT_ID` و `CLOUDFLARE_API_TOKEN` واقعی کارفرما (مسیر کد تأیید شده، اما رندر واقعی هنوز دیده نشده)

جزئیات کامل در گزارش Gate Check ارائه‌شده به کارفرما.

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

متغیرهای محیطی لازم (نگاه کنید به `.dev.vars.example`): `SMS_PROVIDER`, `KAVENEGAR_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `TURNSTILE_SECRET_KEY`, `FILE_SIGN_SECRET`.

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
- **وضعیت**: ⏳ در انتظار توکن واقعی Cloudflare کارفرما (`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`) برای دیپلوی و تأیید نهایی PDF
- **تکنولوژی**: Hono + TypeScript + Drizzle ORM + D1 + R2 + Browser Rendering
- **آخرین به‌روزرسانی**: ۱۴۰۵/۰۶/۰۴ (2026-08-26)
