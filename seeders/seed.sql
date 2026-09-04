-- Seed data: roles, permissions, role->permission mapping, expertise
-- areas, content categories/tags, age groups (spec §12.1 "پیشنهاد خودت،
-- توسط تیم اجرایی قابل ویرایش، توسط اعضا غیرقابل تغییر").
-- Run with: npm run db:seed:local (or db:migrate:prod + manual execute for production)

-- ===================== Roles =====================
INSERT OR IGNORE INTO roles (key, label_fa, description) VALUES
  ('member', 'عضو جامعه', 'والدین، معلمان، مربیان و دغدغه‌مندان تربیت فرزند'),
  ('expert', 'مدرس/کارشناس تأییدشده', 'کارشناس یا مدرس تأییدشده با صلاحیت حرفه‌ای مرتبط'),
  ('professor', 'استاد تربیت رسانه‌ای', 'استاد و متخصص برجستهٔ تأییدشده در حوزهٔ تربیت رسانه‌ای'),
  ('moderator', 'ناظر پرسش‌کده و جامعه', 'نظارت بر محتوا، گزارش‌ها و گفت‌وگوی جامعه'),
  ('scientific_manager', 'مدیر علمی', 'مدیریت استادان/کارشناسان، کیفیت و پاسخ‌های منتخب'),
  ('super_admin', 'مدیر اصلی سامانه', 'دسترسی کامل به همهٔ بخش‌ها');

-- ===================== Permissions =====================
INSERT OR IGNORE INTO permissions (key, label_fa, "group") VALUES
  ('question.create', 'ثبت پرسش', 'question'),
  ('question.view_private', 'مشاهدهٔ نسخهٔ خصوصی پرسش', 'question'),
  ('question.moderate', 'مدیریت وضعیت پرسش', 'question'),
  ('question.assign', 'ارجاع پرسش به استاد/کارشناس', 'question'),
  ('response.create', 'ثبت پاسخ/تجربه', 'response'),
  ('response.reply', 'ریپلای به پاسخ', 'response'),
  ('response.edit_own', 'ویرایش پاسخ خود', 'response'),
  ('response.moderate', 'تأیید/رد/پنهان‌سازی پاسخ', 'response'),
  ('response.editor_pick', 'انتخاب پاسخ منتخب تحریریه', 'response'),
  ('response.science_review', 'برچسب بازبینی‌شدهٔ علمی', 'response'),
  ('professional.invite', 'دعوت استاد/کارشناس', 'professional'),
  ('professional.approve', 'تأیید استاد/کارشناس', 'professional'),
  ('professional.manage_expertise', 'مدیریت حوزه‌های تخصص', 'professional'),
  ('content.create', 'ایجاد محتوای مرجع', 'content'),
  ('content.publish', 'انتشار محتوای مرجع', 'content'),
  ('content.manage_categories', 'مدیریت دسته‌بندی‌ها و برچسب‌ها', 'content'),
  ('moderation.view_queue', 'مشاهدهٔ صف نظارت', 'moderation'),
  ('moderation.resolve_report', 'رسیدگی به گزارش تخلف', 'moderation'),
  ('moderation.restrict_user', 'محدودسازی/تعلیق کاربر', 'moderation'),
  ('settings.manage', 'مدیریت تنظیمات حساس', 'settings'),
  ('settings.manage_rate_limits', 'مدیریت محدودیت نرخ', 'settings'),
  ('settings.manage_crisis_messages', 'مدیریت پیام‌های ارجاع بحران', 'settings'),
  ('audit.view', 'مشاهدهٔ Audit Log', 'audit');

-- ===================== Role -> Permission mapping =====================
-- member
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'member' AND p.key IN ('question.create','response.create','response.reply','response.edit_own');

-- expert (all member perms + none moderation, per spec §5.2.C)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'expert' AND p.key IN ('question.create','response.create','response.reply','response.edit_own');

-- professor (same base as expert, per spec §5.2.D)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'professor' AND p.key IN ('question.create','response.create','response.reply','response.edit_own');

-- moderator
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'moderator' AND p.key IN (
  'question.create','response.create','response.reply','response.edit_own',
  'question.view_private','question.moderate','question.assign',
  'response.moderate','moderation.view_queue','moderation.resolve_report',
  'moderation.restrict_user','content.publish'
);

-- scientific_manager (moderator + professional + editorial)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'scientific_manager' AND p.key IN (
  'question.create','response.create','response.reply','response.edit_own',
  'question.view_private','question.moderate','question.assign',
  'response.moderate','response.editor_pick','response.science_review',
  'moderation.view_queue','moderation.resolve_report','moderation.restrict_user',
  'professional.invite','professional.approve','professional.manage_expertise',
  'content.create','content.publish','content.manage_categories','audit.view',
  'settings.manage_crisis_messages'
);

-- super_admin gets every permission explicitly too (defense in depth,
-- even though AuthzService already grants an implicit bypass)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.key = 'super_admin';

-- ===================== Age groups (spec §7.2 / §9.2) =====================
INSERT OR IGNORE INTO age_groups (slug, label_fa, sort_order) VALUES
  ('under_6', 'زیر ۶ سال', 1),
  ('6_9', '۶ تا ۹ سال', 2),
  ('9_12', '۹ تا ۱۲ سال', 3),
  ('12_15', '۱۲ تا ۱۵ سال', 4),
  ('15_18', '۱۵ تا ۱۸ سال', 5),
  ('other', 'سایر', 6);

-- ===================== Content categories (spec §7.2, admin-editable) =====================
INSERT OR IGNORE INTO content_categories (slug, name_fa, sort_order) VALUES
  ('child-and-media', 'فرزند و رسانه', 1),
  ('parent-child-relationship', 'رابطهٔ والد و فرزند', 2),
  ('mindful-parent', 'والد آگاه', 3),
  ('couples-and-media', 'زوجین و رسانه', 4),
  ('mentor-and-school', 'مربی و مدرسه', 5),
  ('media-literacy', 'فهم رسانه', 6);

-- ===================== Content tags / topics (spec §7.2) =====================
INSERT OR IGNORE INTO content_tags (slug, name_fa) VALUES
  ('phone-and-screen-time', 'گوشی و زمان صفحه'),
  ('digital-games', 'بازی‌های دیجیتال'),
  ('social-networks', 'شبکه‌های اجتماعی'),
  ('inappropriate-content', 'محتوای نامناسب'),
  ('sleep-and-focus', 'خواب و تمرکز'),
  ('conversation-and-rules', 'گفت‌وگو و قانون‌گذاری'),
  ('monitoring-trust-privacy', 'نظارت، اعتماد و حریم خصوصی'),
  ('parental-disagreement', 'اختلاف والدین'),
  ('couples-digital-presence', 'حضور دیجیتال زوجین'),
  ('online-bullying', 'قلدری و مزاحمت آنلاین'),
  ('ai-at-home-and-school', 'هوش مصنوعی در خانه و مدرسه');

-- ===================== Tools (spec §11) =====================
INSERT OR IGNORE INTO tools (slug, title_fa, description, pdf_template_key) VALUES
  ('family_media_contract', 'قرارداد رسانه‌ای خانواده', 'توافق شخصی‌سازی‌شده برای استفاده از رسانه در خانواده', 'family_media_contract_v1'),
  ('phone_readiness_checklist', 'چک‌لیست آمادگی دریافت گوشی شخصی', 'ارزیابی چندبعدی آمادگی فرزند برای دریافت گوشی شخصی', 'phone_readiness_checklist_v1'),
  ('media_style_quiz', 'آزمون سبک رسانه‌ای خانواده', 'شناسایی نقاط قوت و حوزه‌های نیازمند توجه در سبک رسانه‌ای خانواده', 'media_style_quiz_v1');

-- ===================== Settings defaults (spec §12.1, admin-editable) =====================
INSERT OR IGNORE INTO settings (key, value_json, description) VALUES
  ('rate_limits', '{"otp_attempts_per_10min":3,"questions_per_day":5,"responses_per_day":20}', 'محدودیت نرخ پیش‌فرض (D-008)'),
  ('trust_promotion_threshold', '5', 'تعداد پاسخ منتشرشدهٔ بدون تخلف برای ارتقا به وضعیت خوش‌سابقه'),
  ('crisis_keywords', '[]', 'واژه‌های پرخطر برای پرچم‌گذاری خودکار (تیم اجرایی تکمیل می‌کند)'),
  ('crisis_referral_messages', '{}', 'قالب پیام‌های راهنما برای هر دسته از موارد ارجاعی بحران');

-- ===================== Sample published articles (client decision row 9) =====================
-- 5 structured placeholder articles, one per major category, each with a
-- short-answer teaser + full body, so Phase 1 content pages have real data
-- to render against. Content team will replace with reviewed final copy.
INSERT OR IGNORE INTO contents (slug, title, summary, short_answer, body, category_id, age_group_id, audience, status, seo_title, seo_description, published_at) VALUES
(
  'phone-time-without-fighting',
  'چطور بدون دعوا دربارهٔ زمان گوشی با فرزندم توافق کنم؟',
  'راهکارهای عملی برای تبدیل «قانون‌گذاری زمان صفحه» از یک منبع تنش به یک توافق مشترک.',
  'به‌جای وضع قانون یک‌طرفه، فرزندتان را در تعیین زمان مشارکت دهید و توافق را مکتوب و قابل بازبینی نگه دارید.',
  'بسیاری از خانواده‌ها زمان استفاده از گوشی را به میدان جنگ روزانه تبدیل می‌کنند، در حالی که راه‌حل معمولاً در نحوهٔ گفت‌وگو نهفته است، نه در سخت‌گیری بیشتر.

نکتهٔ اول: قانون تحمیلی دوام نمی‌آورد. وقتی فرزند در تعیین بازهٔ زمانی مشارکت داشته باشد، احساس مالکیت نسبت به قانون پیدا می‌کند و کمتر آن را زیر پا می‌گذارد.

نکتهٔ دوم: قانون را مکتوب کنید. یک برگهٔ ساده یا حتی «قرارداد رسانه‌ای خانواده» (یکی از ابزارهای همین پلتفرم) باعث می‌شود توافق شفاف و قابل ارجاع باشد، نه یک خاطرهٔ مبهم از یک گفت‌وگوی قدیمی.

نکتهٔ سوم: زمان بازبینی مشخص کنید. نیازهای فرزند شما هر چند ماه تغییر می‌کند؛ قانونی که برای یک کودک ۸ ساله نوشته شده، برای همان فرد در ۱۱ سالگی نیاز به بازنگری دارد.

نکتهٔ چهارم: پیامد را از قبل روشن کنید، نه در لحظهٔ عصبانیت. وقتی پیامد عبور از زمان تعیین‌شده از قبل و با آرامش مشخص شده باشد، اجرای آن به‌جای یک تنبیه ناگهانی، به یک قاعدهٔ شناخته‌شده تبدیل می‌شود.',
  (SELECT id FROM content_categories WHERE slug = 'child-and-media'),
  (SELECT id FROM age_groups WHERE slug = '9_12'),
  'parent',
  'published',
  'توافق بدون دعوا بر سر زمان گوشی فرزند',
  'راهکارهای عملی برای پایان دادن به دعوای روزانهٔ زمان گوشی با مشارکت فرزند در تصمیم‌گیری.',
  '2026-06-01T08:00:00.000Z'
),
(
  'talking-about-inappropriate-content',
  'اگر فرزندم با محتوای نامناسب مواجه شد چه بگویم؟',
  'واکنش اولیهٔ والدین در این لحظه، تعیین می‌کند که فرزند دفعهٔ بعد باز هم با شما در میان می‌گذارد یا نه.',
  'اول آرام بمانید و از فرزند تشکر کنید که موضوع را گفته است؛ قضاوت و توبیخ در همان لحظه، باعث می‌شود دفعهٔ بعد چیزی نگوید.',
  'واکنش اول والدین در برابر افشای مواجهه با محتوای نامناسب، مهم‌ترین عامل در این است که آیا فرزند در آینده دوباره با شما صحبت می‌کند یا این تجربه را پنهان نگه می‌دارد.

گام اول: آرامش خود را حفظ کنید. نشان دادن شوک یا عصبانیت شدید، پیام ناخواسته‌ای می‌فرستد: «این موضوع را دیگر با او در میان نگذار.»

گام دوم: از فرزند بابت گفتن این موضوع تشکر کنید. جملاتی مثل «خوشحالم که این را با من در میان گذاشتی» اعتماد را تقویت می‌کند.

گام سوم: بدون قضاوت دربارهٔ فرزند، دربارهٔ خودِ محتوا صحبت کنید. تمرکز گفت‌وگو باید روی «این محتوا چه بود و چرا نامناسب است» باشد، نه «تو چرا این را دیدی».

گام چهارم: در صورت نیاز، به کمک حرفه‌ای فکر کنید. اگر مواجهه تکرارشونده است یا نشانه‌های نگران‌کننده‌ای (اضطراب شدید، تغییر رفتار) دیده می‌شود، مشورت با یک متخصص تربیت رسانه‌ای یا روان‌شناس کودک توصیه می‌شود.',
  (SELECT id FROM content_categories WHERE slug = 'child-and-media'),
  (SELECT id FROM age_groups WHERE slug = '9_12'),
  'parent',
  'published',
  'واکنش والدین به مواجههٔ فرزند با محتوای نامناسب',
  'راهنمای گام‌به‌گام برای گفت‌وگوی آرام و مؤثر پس از مواجههٔ فرزند با محتوای نامناسب آنلاین.',
  '2026-06-05T08:00:00.000Z'
),
(
  'when-parents-disagree-on-screen-rules',
  'وقتی من و همسرم دربارهٔ قوانین صفحه‌نمایش هم‌نظر نیستیم چه کنیم؟',
  'اختلاف والدین دربارهٔ قوانین رسانه، وقتی جلوی فرزند بروز کند، از خودِ قانون آسیب‌زننده‌تر است.',
  'ابتدا اختلاف را بدون حضور فرزند حل کنید و سپس یک قانون واحد و هماهنگ را به‌عنوان تصمیم مشترک اعلام کنید.',
  'یکی از رایج‌ترین چالش‌های خانواده‌ها، اختلاف‌نظر والدین دربارهٔ سخت‌گیری یا آسان‌گیری در قوانین رسانه‌ای است — و بروز این اختلاف جلوی فرزند، معمولاً از خودِ قانون آسیب‌زننده‌تر است.

چرا مهم است: فرزندی که می‌بیند والدینش دربارهٔ یک قانون اختلاف دارند، یاد می‌گیرد از این شکاف برای دور زدن قانون استفاده کند («بابا اجازه داد!»).

راهکار اول: گفت‌وگوی اختلاف را به زمان و مکانی بدون حضور فرزند منتقل کنید.

راهکار دوم: به‌جای رسیدن به توافق کامل، به یک «حداقل مشترک قابل قبول برای هر دو نفر» برسید و همان را به‌عنوان تصمیم مشترک خانواده اعلام کنید.

راهکار سوم: اگر اختلاف ریشه‌دار است و در حال آسیب زدن به رابطهٔ زوجین یا فرزند است، مشورت با یک مشاور خانواده می‌تواند مسیر گفت‌وگو را ساختارمندتر کند.',
  (SELECT id FROM content_categories WHERE slug = 'couples-and-media'),
  (SELECT id FROM age_groups WHERE slug = 'other'),
  'parent',
  'published',
  'حل اختلاف والدین دربارهٔ قوانین رسانه‌ای',
  'چگونه اختلاف‌نظر زوجین دربارهٔ قوانین صفحه‌نمایش را بدون آسیب به فرزند حل کنیم.',
  '2026-06-10T08:00:00.000Z'
),
(
  'mentor-classroom-phone-policy',
  'به‌عنوان مربی، چطور قانون گوشی در کلاس را بدون درگیری اجرا کنم؟',
  'قانونی که از ابتدای سال و با مشارکت دانش‌آموزان تدوین شده باشد، بسیار کمتر به چالش کشیده می‌شود.',
  'قانون را از روز اول، شفاف و با دلیل توضیح دهید و اجرای آن را با ثبات و بدون استثنا دنبال کنید.',
  'مربیان و معلمان اغلب با چالش اجرای قانون گوشی در کلاس مواجه‌اند، به‌ویژه وقتی قانون به‌صورت ناگهانی وسط سال تحصیلی اعلام شود.

نکتهٔ اول: قانون را از جلسهٔ اول و به‌صورت شفاف اعلام کنید، همراه با دلیل («گوشی حواس از یادگیری را کم می‌کند»)، نه فقط دستور خشک.

نکتهٔ دوم: در تدوین جزئیات (مثلاً محل نگهداری گوشی در کلاس) از دانش‌آموزان نظرخواهی کنید؛ مشارکت آن‌ها، مقاومت را کاهش می‌دهد.

نکتهٔ سوم: قانون را بدون استثنا و به‌طور یکنواخت برای همه اجرا کنید. اعمال متفاوت قانون برای دانش‌آموزان مختلف، اعتبار قانون را از بین می‌برد.

نکتهٔ چهارم: در صورت بروز مشکل مکرر با یک دانش‌آموز خاص، به‌جای برخورد در کلاس و جلوی همکلاسی‌ها، گفت‌وگوی خصوصی و در صورت نیاز هماهنگی با خانواده مؤثرتر است.',
  (SELECT id FROM content_categories WHERE slug = 'mentor-and-school'),
  (SELECT id FROM age_groups WHERE slug = '12_15'),
  'teacher',
  'published',
  'اجرای قانون گوشی در کلاس درس',
  'راهنمای مربیان برای وضع و اجرای قانون استفاده از گوشی در کلاس بدون درگیری با دانش‌آموزان.',
  '2026-06-15T08:00:00.000Z'
),
(
  'understanding-algorithmic-feeds',
  'فرزندم اصلاً نمی‌تواند از اینستاگرام/تیک‌تاک جدا شود؛ چرا اینقدر سخت است؟',
  'طراحی الگوریتمی این پلتفرم‌ها عمداً برای به تعویق انداختن لحظهٔ «توقف» ساخته شده است — این یک ضعف اراده نیست.',
  'به فرزندتان کمک کنید بفهمد فید بی‌پایان عمداً طراحی شده تا توقف را سخت کند؛ این آگاهی، اولین قدم برای کنترل آگاهانه است.',
  'بسیاری از والدین رفتار فرزندشان در برابر شبکه‌های اجتماعی را نشانهٔ ضعف اراده می‌دانند، در حالی که بخش بزرگی از این رفتار، نتیجهٔ طراحی عمدی این پلتفرم‌هاست.

مفهوم کلیدی: «فید بی‌پایان» (infinite scroll) و پیشنهادهای الگوریتمی، دقیقاً برای حذف نقطهٔ طبیعی توقف طراحی شده‌اند. مغز انسان، به‌ویژه در نوجوانی، در برابر این طراحی آسیب‌پذیرتر است.

چرا این آگاهی مهم است: وقتی فرزند بفهمد این وابستگی نتیجهٔ یک طراحی حساب‌شده است، نه یک نقص شخصیتی، بهتر می‌تواند وارد گفت‌وگوی مشترک برای مدیریت آن شود.

راهکار عملی اول: به‌جای «قطع کامل»، از ابزارهای داخلی پلتفرم‌ها (یادآور زمان استفاده، حالت تمرکز) به‌عنوان شروع استفاده کنید.

راهکار عملی دوم: زمان‌های بدون صفحه را به‌صورت خانوادگی و نه فقط برای فرزند تعریف کنید — الگوی رفتاری والدین در این زمینه بسیار تأثیرگذار است.

راهکار عملی سوم: به فرزند کمک کنید فعالیت‌های جایگزین جذاب (نه صرفاً «برو درس بخوان») برای زمان آزادش پیدا کند؛ خلأ ایجادشده باید با چیزی پر شود.',
  (SELECT id FROM content_categories WHERE slug = 'media-literacy'),
  (SELECT id FROM age_groups WHERE slug = '12_15'),
  'parent',
  'published',
  'چرا جدا شدن از شبکه‌های اجتماعی برای نوجوانان سخت است',
  'فهم طراحی الگوریتمی فید بی‌پایان و راهکارهای عملی برای مدیریت آگاهانهٔ استفاده از شبکه‌های اجتماعی.',
  '2026-06-20T08:00:00.000Z'
);

-- =====================================================================
-- Phase 2 (پرسش‌کدهٔ خانواده و رسانه) seed data — client sign-off session
-- =====================================================================

-- ===================== Update: crisis keywords (task ۲.۲) =====================
-- Replaces the empty placeholder row with the real list also hard-coded as
-- DEFAULT_CRISIS_KEYWORDS in src/services/crisis-triage.service.ts (kept in
-- sync intentionally — the settings row is what QuestionService actually
-- reads; DEFAULT_CRISIS_KEYWORDS is only the safety-net fallback if this
-- settings row is ever missing/corrupted).
UPDATE settings
SET value_json = '["خودکشی","خودکشي","خودآسیبی","خودآسیب‌رسانی","آزار جنسی","سوءاستفاده جنسی","تجاوز","خشونت فیزیکی شدید","باج‌گیری","باج گیری","اخاذی اینترنتی","اخاذی"]'
WHERE key = 'crisis_keywords';

UPDATE settings
SET value_json = '{"private_referral":"پرسش شما با موفقیت ثبت شد. با توجه به حساسیت موضوع، این مورد به‌صورت خصوصی و مستقیم در اختیار یک متخصص قرار گرفت و منتشر نخواهد شد. لطفاً به بخش «راهنمای شرایط بحرانی» مراجعه کنید تا در صورت نیاز فوری، با مراجع پشتیبانی مرتبط تماس بگیرید."}'
WHERE key = 'crisis_referral_messages';

-- ===================== Expertise areas (task ۲.۱) =====================
-- D-013: slugs MUST equal existing content_categories slugs so
-- ProfessionalRepository.listExpertiseCategoryIds() can match professionals
-- to relevant questions/content by slug (the two taxonomies are
-- intentionally NOT foreign-keyed to each other).
INSERT OR IGNORE INTO expertise_areas (slug, label_fa) VALUES
  ('child-and-media', 'فرزند و رسانه'),
  ('parent-child-relationship', 'رابطهٔ والد و فرزند'),
  ('mindful-parent', 'والد آگاه'),
  ('couples-and-media', 'زوجین و رسانه'),
  ('mentor-and-school', 'مربی و مدرسه'),
  ('media-literacy', 'فهم رسانه');

-- ===================== Test accounts (task ۴.۳: حساب‌های تست) =====================
-- Auth is phone+OTP only (no password field) — these are real, loginable
-- accounts: the client logs in normally at /login with the phone number
-- below, and reads the OTP code via the diagnostic-only endpoint
-- GET /api/_gatecheck/last-otp/:phone (see src/routes/dev-tools.ts —
-- active ONLY while SMS_PROVIDER is not 'kavenegar', i.e. never in a real
-- production deploy with a real SMS provider configured).

-- 1. Professor test account — دکتر سارا احمدی (استاد تربیت رسانه‌ای)
INSERT OR IGNORE INTO users (phone_number, phone_verified_at, status, trust_level) VALUES
  ('+989120000101', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'active', 'trusted');
INSERT OR IGNORE INTO profiles (user_id, display_name, real_name, show_real_name, profile_type, bio)
SELECT id, 'دکتر سارا احمدی', 'سارا احمدی', 1, 'other', 'استاد تربیت رسانه‌ای، دانشگاه تهران — بیش از ۱۵ سال تجربهٔ پژوهش در حوزهٔ رسانه و کودک.'
FROM users WHERE phone_number = '+989120000101';
INSERT OR IGNORE INTO model_has_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r WHERE u.phone_number = '+989120000101' AND r.key = 'professor';
INSERT OR IGNORE INTO professional_profiles (user_id, credential_type, status, professional_title, short_bio, fast_publish_enabled, approved_at)
SELECT id, 'professor', 'active', 'استاد تربیت رسانه‌ای، دانشگاه تهران', 'پژوهشگر و مدرس حوزهٔ اثرات رسانه بر کودک و نوجوان.', 1, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM users WHERE phone_number = '+989120000101';
INSERT OR IGNORE INTO professional_expertise_areas (professional_profile_id, expertise_area_id)
SELECT pp.id, ea.id FROM professional_profiles pp, expertise_areas ea
WHERE pp.user_id = (SELECT id FROM users WHERE phone_number = '+989120000101')
  AND ea.slug IN ('child-and-media', 'media-literacy', 'mindful-parent');

-- 2. Expert test account — مهندس رضا کریمی (کارشناس تأییدشده)
INSERT OR IGNORE INTO users (phone_number, phone_verified_at, status, trust_level) VALUES
  ('+989120000102', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'active', 'trusted');
INSERT OR IGNORE INTO profiles (user_id, display_name, real_name, show_real_name, profile_type, bio)
SELECT id, 'رضا کریمی', 'رضا کریمی', 1, 'other', 'کارشناس روان‌شناسی خانواده و مشاور مدرسه، متخصص چالش‌های نوجوانی و فضای مجازی.'
FROM users WHERE phone_number = '+989120000102';
INSERT OR IGNORE INTO model_has_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r WHERE u.phone_number = '+989120000102' AND r.key = 'expert';
INSERT OR IGNORE INTO professional_profiles (user_id, credential_type, status, professional_title, short_bio, fast_publish_enabled, approved_at)
SELECT id, 'expert', 'active', 'کارشناس روان‌شناسی خانواده', 'مشاور مدرسه با تمرکز بر چالش‌های رسانه‌ای نوجوانان.', 0, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM users WHERE phone_number = '+989120000102';
INSERT OR IGNORE INTO professional_expertise_areas (professional_profile_id, expertise_area_id)
SELECT pp.id, ea.id FROM professional_profiles pp, expertise_areas ea
WHERE pp.user_id = (SELECT id FROM users WHERE phone_number = '+989120000102')
  AND ea.slug IN ('mentor-and-school', 'parent-child-relationship');

-- 3. Ordinary member test account — نگار حسینی (والد عادی، عضو جامعه)
INSERT OR IGNORE INTO users (phone_number, phone_verified_at, status, trust_level) VALUES
  ('+989120000103', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'active', 'new');
INSERT OR IGNORE INTO profiles (user_id, display_name, profile_type, bio)
SELECT id, 'نگار.ح', 'mother', 'مادر دو فرزند در سنین ۸ و ۱۳ سال.'
FROM users WHERE phone_number = '+989120000103';
INSERT OR IGNORE INTO model_has_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r WHERE u.phone_number = '+989120000103' AND r.key = 'member';

-- 4. Moderator test account — امیر یوسفی (ناظر پرسش‌کده)
INSERT OR IGNORE INTO users (phone_number, phone_verified_at, status, trust_level) VALUES
  ('+989120000104', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'active', 'trusted');
INSERT OR IGNORE INTO profiles (user_id, display_name, real_name, show_real_name, profile_type)
SELECT id, 'امیر یوسفی', 'امیر یوسفی', 1, 'other'
FROM users WHERE phone_number = '+989120000104';
INSERT OR IGNORE INTO model_has_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r WHERE u.phone_number = '+989120000104' AND r.key = 'moderator';

-- 5. Two extra plain member accounts, used as thread participants /
--    reply authors below (so the sample threads don't all look like a
--    conversation between the same two people).
INSERT OR IGNORE INTO users (phone_number, phone_verified_at, status, trust_level) VALUES
  ('+989120000105', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'active', 'new'),
  ('+989120000106', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'active', 'new');
INSERT OR IGNORE INTO profiles (user_id, display_name, profile_type)
SELECT id, 'پدر.م', 'father' FROM users WHERE phone_number = '+989120000105';
INSERT OR IGNORE INTO profiles (user_id, display_name, profile_type)
SELECT id, 'مریم.مربی', 'mentor' FROM users WHERE phone_number = '+989120000106';
INSERT OR IGNORE INTO model_has_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r WHERE u.phone_number = '+989120000105' AND r.key = 'member';
INSERT OR IGNORE INTO model_has_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r WHERE u.phone_number = '+989120000106' AND r.key = 'member';


-- ===================== 5 Q&A threads for پرسش‌کده (task ۲.۳) =====================
-- Each thread: 1 question (published, anonymized) + responses covering all
-- 4 credibility tiers (professor/expert/member_experience/member) + a
-- nested reply (depth 2) to exercise the threaded-tree UI and the
-- reply-tree-integrity-after-tombstone test scenario.
-- Author-level snapshot values MUST exactly match AUTHOR_LEVELS in
-- src/db/schema/responses.ts: professor | expert | member_experience | member.

-- --------------------------------------------------------------
-- Thread 1: کودک/رسانه — استفادهٔ پنهانی شبانه از گوشی
-- --------------------------------------------------------------
INSERT OR IGNORE INTO questions (
  slug, author_user_id, author_role, context_space, age_group_id, category_id,
  is_recurring, urgency_level, raw_title, raw_what_happened, raw_since_when,
  raw_tried_so_far, raw_help_requested, public_title, public_body,
  is_anonymized, publication_choice, consent_accepted_at, status, published_at
)
SELECT
  'child-hides-phone-use-at-night', u.id, 'mother', 'home',
  (SELECT id FROM age_groups WHERE slug = '12_15'),
  (SELECT id FROM content_categories WHERE slug = 'child-and-media'),
  1, 'concerning',
  'فرزندم شبانه و مخفیانه با گوشی است',
  'چند هفته است متوجه شده‌ام فرزند ۱۳ سالهٔ من بعد از این‌که فکر می‌کند خواب هستیم، گوشی را زیر پتو می‌برد و تا نیمه‌شب پیام می‌دهد. به‌محض این‌که صدای در را می‌شنود، سریع صفحه را خاموش می‌کند.',
  'حدود یک ماه',
  'یک بار گوشی را بعد از ساعت ۱۰ شب از او گرفتم، اما او از گوشی قدیمی خواهر بزرگ‌ترش استفاده کرد.',
  'می‌خواهم بدون این‌که رابطه‌مان خراب شود یا او بیشتر پنهان‌کاری کند، این موضوع را مدیریت کنم.',
  'فرزند نوجوان من مدتی است شبانه و مخفیانه با گوشی وقت می‌گذراند و وقتی احساس می‌کند کسی نزدیک می‌شود، به‌سرعت صفحه را می‌بندد. نگرانم هم به خواب او آسیب بزند و هم این پنهان‌کاری نشانهٔ چیز دیگری باشد.',
  1, 'publish_after_anonymization', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM users u WHERE u.phone_number = '+989120000103';

-- Professor (top-level, rank 1)
INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, is_science_reviewed, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'professor',
  'پنهان‌کاری شبانه معمولاً واکنشی به یک قانون سرسختانه است، نه صرفاً وابستگی به گوشی. به‌جای برخورد تنبیهی، یک گفت‌وگوی آرام در روز (نه شب، نه لحظهٔ گیر افتادن) پیشنهاد می‌کنم: به او بگویید متوجه شده‌اید و به‌جای بازخواست، از او بپرسید «چه چیزی این‌قدر مهم است که خواب را هم به آن ترجیح می‌دهی؟». معمولاً پاسخ یا FOMO از گروه دوستان است یا اضطراب اجتماعی. راه‌حل پایدار، توافق مشترک روی محل شارژ گوشی‌ها (خارج از اتاق خواب، برای همهٔ اعضای خانواده، نه فقط او) است، نه ضبط یک‌طرفهٔ گوشی.',
  'published', 1, (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'child-hides-phone-use-at-night' AND u.phone_number = '+989120000101'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

-- Expert (top-level, rank 2)
INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'expert',
  'از منظر مشاورهٔ مدرسه، اولین قدم این است که با آرامش و بدون قضاوت به او بگویید که می‌دانید. تمرکز مکالمه را از «تو چرا این کار را کردی» به «چطور می‌توانیم راهی پیدا کنیم که هم دوستانت را از دست ندهی و هم خوب بخوابی» ببرید. پیشنهاد عملی: یک «قرارداد رسانه‌ای خانواده» بنویسید که ساعت خواب گوشی برای همهٔ اعضا یکسان باشد؛ این کار حس تنبیه‌شدن را از او می‌گیرد.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'child-hides-phone-use-at-night' AND u.phone_number = '+989120000102'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

-- Member experience (top-level, rank 3 — parent sharing lived experience)
INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'member_experience',
  'دقیقاً همین وضعیت را با پسرم داشتم. بعد از چند شب دعوا، نهایتاً یک «ایستگاه شارژ خانواده» در آشپزخانه گذاشتیم که ساعت ۱۰ شب همهٔ گوشی‌ها (حتی گوشی من و همسرم) آنجا شارژ می‌شوند. اولش غرغر کرد ولی چون قانون برای همه بود، دیگر حس تنبیه نداشت. الان چند ماه است این روتین جا افتاده.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'child-hides-phone-use-at-night' AND u.phone_number = '+989120000105'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

-- self-reference root_response_id for the 3 top-level rows above
UPDATE responses SET root_response_id = id
WHERE question_id = (SELECT id FROM questions WHERE slug = 'child-hides-phone-use-at-night')
  AND parent_id IS NULL AND root_response_id IS NULL;

-- Member reply (depth 1) to the professor's answer
INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, reply_to_display_name, published_at, created_at)
SELECT q.id, prof.id, prof.id, 1, mem.id, 'member',
  'ممنون از توضیح‌تان استاد. سوال من این است: اگر در گفت‌وگوی آرام هم قبول نکرد که گوشی را بیرون از اتاق شارژ کند، قدم بعدی چیست؟',
  'published', 'دکتر سارا احمدی', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users mem, responses prof, users profu
WHERE q.slug = 'child-hides-phone-use-at-night'
  AND mem.phone_number = '+989120000106'
  AND profu.phone_number = '+989120000101'
  AND prof.question_id = q.id AND prof.parent_id IS NULL AND prof.author_user_id = profu.id
  AND NOT EXISTS (SELECT 1 FROM responses r2 WHERE r2.question_id = q.id AND r2.author_user_id = mem.id AND r2.parent_id = prof.id);

-- Nested member reply (depth 2) to the depth-1 reply above
INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, reply_to_display_name, published_at, created_at)
SELECT q.id, r1.id, r1.root_response_id, 2, mem2.id, 'member',
  'من هم همین تجربه را داشتم؛ وقتی قبول نکرد، چند شب فقط با ثبات کامل و بدون بحث دوباره، ساعت ۱۰ خودم گوشی را (با احترام، نه قهر) به ایستگاه شارژ بردم. بعد از حدود یک هفته دیگر خودش می‌برد.',
  'published', 'مریم.مربی', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users mem2, responses r1
WHERE q.slug = 'child-hides-phone-use-at-night'
  AND mem2.phone_number = '+989120000103'
  AND r1.question_id = q.id AND r1.depth = 1
  AND r1.author_user_id = (SELECT id FROM users WHERE phone_number = '+989120000106')
  AND NOT EXISTS (SELECT 1 FROM responses r3 WHERE r3.question_id = q.id AND r3.author_user_id = mem2.id AND r3.parent_id = r1.id);


-- --------------------------------------------------------------
-- Thread 2: رابطهٔ والد و فرزند — نظارت بر شبکه‌های اجتماعی و اعتماد
-- --------------------------------------------------------------
INSERT OR IGNORE INTO questions (
  slug, author_user_id, author_role, context_space, age_group_id, category_id,
  is_recurring, urgency_level, raw_title, raw_what_happened, raw_since_when,
  raw_tried_so_far, raw_help_requested, public_title, public_body,
  is_anonymized, publication_choice, consent_accepted_at, status, published_at
)
SELECT
  'monitor-teen-social-media-without-breaking-trust', u.id, 'father', 'home',
  (SELECT id FROM age_groups WHERE slug = '15_18'),
  (SELECT id FROM content_categories WHERE slug = 'parent-child-relationship'),
  0, 'normal',
  'آیا باید مخفیانه اینستاگرام دخترم را چک کنم؟',
  'دخترم ۱۶ ساله است و اخیراً یک دوست جدید در اینستاگرام دارد که هویتش برایم روشن نیست. وسوسه می‌شوم بدون اطلاعش پسورد را ببینم، اما می‌ترسم اگر بفهمد اعتمادش را کامل از دست بدهم.',
  'دو هفته',
  'یک بار غیرمستقیم دربارهٔ آن دوست جدید سوال کردم، جواب کوتاه و مبهم داد.',
  'می‌خواهم بدانم نظارت تا چه حد درست است و چطور بدون خرابکاری در رابطه انجامش دهم.',
  'دخترم نوجوان یک دوستی آنلاین جدید و ناشناخته پیدا کرده و نگران هستم، اما می‌ترسم نظارت مخفیانه اعتماد بین ما را خدشه‌دار کند.',
  1, 'publish_after_anonymization', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM users u WHERE u.phone_number = '+989120000105';

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, is_science_reviewed, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'professor',
  'نظارت مخفیانه در نوجوانی ۱۵ به بالا معمولاً بازده منفی دارد: اگر کشف شود (و معمولاً می‌شود)، اعتماد برای مدت طولانی آسیب می‌بیند و نوجوان یاد می‌گیرد پنهان‌کاری کند، نه شفاف باشد. رویکرد مؤثرتر «نظارت شفاف و توافقی» است: از ابتدا با او دربارهٔ این‌که چرا برای امنیتش نگرانید صحبت کنید و مرزهای مشخص (نه کنترل کامل، بلکه آگاهی از الگوی کلی رفتار آنلاین) را با او مذاکره کنید.',
  'published', 1, (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'monitor-teen-social-media-without-breaking-trust' AND u.phone_number = '+989120000101'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'expert',
  'پیشنهاد می‌کنم به‌جای تمرکز صرف روی «چک کردن گوشی»، گفت‌وگو را روی خودِ دوستی جدید ببرید: «چطور با این دوست آشنا شدید؟ چه چیزی از او می‌دانید؟» این سوالات کنجکاوانه و غیرمتهم‌کننده، اطلاعات بیشتری از نظارت مخفی به شما می‌دهند و حس بازجویی نمی‌دهند.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'monitor-teen-social-media-without-breaking-trust' AND u.phone_number = '+989120000102'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'member_experience',
  'من با پسرم یک قانون داشتم: هر حساب شبکهٔ اجتماعی که می‌سازد، من هم به‌عنوان دنبال‌کننده (نه مدیر) اضافه می‌شوم و این را از روز اول شفاف گفتم. این کار حس تجسس نمی‌داد چون از ابتدا توافق‌شده بود، نه غافلگیرکننده.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'monitor-teen-social-media-without-breaking-trust' AND u.phone_number = '+989120000106'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

UPDATE responses SET root_response_id = id
WHERE question_id = (SELECT id FROM questions WHERE slug = 'monitor-teen-social-media-without-breaking-trust')
  AND parent_id IS NULL AND root_response_id IS NULL;

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, reply_to_display_name, published_at, created_at)
SELECT q.id, exp.id, exp.id, 1, mem.id, 'member',
  'نکتهٔ خوبی بود. من هم دقیقاً همین سوال غیرمستقیم را پرسیدم و جواب بهتری گرفتم تا اینکه مستقیم بپرسم «با کی حرف می‌زنی؟».',
  'published', 'رضا کریمی', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users mem, responses exp, users expu
WHERE q.slug = 'monitor-teen-social-media-without-breaking-trust'
  AND mem.phone_number = '+989120000103'
  AND expu.phone_number = '+989120000102'
  AND exp.question_id = q.id AND exp.parent_id IS NULL AND exp.author_user_id = expu.id
  AND NOT EXISTS (SELECT 1 FROM responses r2 WHERE r2.question_id = q.id AND r2.author_user_id = mem.id AND r2.parent_id = exp.id);


-- --------------------------------------------------------------
-- Thread 3: والد آگاه — الگوی استفادهٔ خود والدین از موبایل
-- --------------------------------------------------------------
INSERT OR IGNORE INTO questions (
  slug, author_user_id, author_role, context_space, age_group_id, category_id,
  is_recurring, urgency_level, raw_title, raw_what_happened, raw_since_when,
  raw_tried_so_far, raw_help_requested, public_title, public_body,
  is_anonymized, publication_choice, consent_accepted_at, status, published_at
)
SELECT
  'my-own-phone-habit-undermines-my-rules', u.id, 'mother', 'home',
  (SELECT id FROM age_groups WHERE slug = '9_12'),
  (SELECT id FROM content_categories WHERE slug = 'mindful-parent'),
  1, 'normal',
  'به فرزندم قانون گوشی می‌دهم اما خودم مدام گوشی دستم است',
  'هفتهٔ پیش فرزند ۱۰ سالهٔ من در جمع خانوادگی گفت «تو هم همیشه گوشی دستته، چرا من نباید داشته باشم؟» و راستش جوابی نداشتم. متوجه شدم واقعاً خودم هم عادت خوبی ندارم.',
  'همیشه بوده، تازه متوجه‌اش شدم',
  'سعی کردم توضیح بدهم که «کار من با گوشی فرق دارد» اما قانع نشد.',
  'می‌خواهم بدانم چطور می‌توانم الگوی بهتری باشم بدون اینکه احساس کنم باید کاملاً از رسانه قطع شوم.',
  'فرزندم متوجه شده که استفادهٔ من از گوشی هم زیاد است و این باعث شده قوانینی که برایش می‌گذارم را کمتر بپذیرد.',
  1, 'publish_after_anonymization', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM users u WHERE u.phone_number = '+989120000103';

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, is_science_reviewed, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'professor',
  'این یکی از صادقانه‌ترین و مهم‌ترین سوالاتی است که یک والد می‌تواند بپرسد. تحقیقات نشان می‌دهد کودکان قوانین رسانه‌ای را نه بر اساس آنچه گفته می‌شود، بلکه بر اساس آنچه دیده می‌شود می‌آموزند («مدل‌سازی رفتاری»). به‌جای توضیح دادن که «کار من فرق دارد» (که برای کودک قابل درک نیست)، پیشنهاد می‌کنم زمان‌های بدون گوشی خانوادگی (نه فقط برای او) تعیین کنید و صادقانه به او بگویید «من هم دارم روی این عادت خودم کار می‌کنم».',
  'published', 1, (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'my-own-phone-habit-undermines-my-rules' AND u.phone_number = '+989120000101'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'expert',
  'یک تمرین عملی: هفته‌ای یک «ساعت بدون گوشی خانوادگی» بگذارید (مثلاً زمان شام) که برای همهٔ اعضا، از جمله والدین، اجباری باشد. این کار به‌مرور اعتبار قوانین رسانه‌ای شما را در چشم فرزندتان بازمی‌گرداند.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'my-own-phone-habit-undermines-my-rules' AND u.phone_number = '+989120000102'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'member_experience',
  'من صادقانه به بچه‌هایم گفتم که خودم هم دارم روی کم کردن گوشی کار می‌کنم و از آن‌ها خواستم اگر دیدند زیاد گوشی دستم است، یادم بیاورند. جالب است که این کار آن‌ها را به‌جای دشمن، هم‌تیمی من در این ماجرا کرد.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'my-own-phone-habit-undermines-my-rules' AND u.phone_number = '+989120000105'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

UPDATE responses SET root_response_id = id
WHERE question_id = (SELECT id FROM questions WHERE slug = 'my-own-phone-habit-undermines-my-rules')
  AND parent_id IS NULL AND root_response_id IS NULL;

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, reply_to_display_name, published_at, created_at)
SELECT q.id, m.id, m.id, 1, mem.id, 'member',
  'همین کار را من هم امتحان کردم، واقعاً حس هم‌تیمی‌شدن به‌جای دشمنی معجزه می‌کند.',
  'published', 'نگار.ح', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users mem, responses m, users mu
WHERE q.slug = 'my-own-phone-habit-undermines-my-rules'
  AND mem.phone_number = '+989120000106'
  AND mu.phone_number = '+989120000105'
  AND m.question_id = q.id AND m.parent_id IS NULL AND m.author_user_id = mu.id
  AND NOT EXISTS (SELECT 1 FROM responses r2 WHERE r2.question_id = q.id AND r2.author_user_id = mem.id AND r2.parent_id = m.id);


-- --------------------------------------------------------------
-- Thread 4: زوجین و رسانه — اختلاف والدین بر سر قانون رسانه‌ای فرزند
-- --------------------------------------------------------------
INSERT OR IGNORE INTO questions (
  slug, author_user_id, author_role, context_space, age_group_id, category_id,
  is_recurring, urgency_level, raw_title, raw_what_happened, raw_since_when,
  raw_tried_so_far, raw_help_requested, public_title, public_body,
  is_anonymized, publication_choice, consent_accepted_at, status, published_at
)
SELECT
  'spouses-disagree-on-screen-time-rules', u.id, 'father', 'couple',
  (SELECT id FROM age_groups WHERE slug = '6_9'),
  (SELECT id FROM content_categories WHERE slug = 'couples-and-media'),
  1, 'normal',
  'من و همسرم سر قانون تبلت پسرمان دائم دعوا داریم',
  'من فکر می‌کنم پسر ۷ ساله‌مان باید حداکثر نیم ساعت در روز تبلت داشته باشد، اما همسرم راحت‌تر برخورد می‌کند و گاهی برای آرام کردنش کل بعدازظهر را با تبلت می‌گذارد. این تفاوت جلوی خود بچه هم باعث بحث می‌شود.',
  'چند ماه',
  'چند بار سعی کردیم توافق کنیم اما هر بار دوباره به روش قبلی خودمان برمی‌گردیم.',
  'می‌خواهیم یک قانون مشترک و پایدار داشته باشیم که جلوی بچه هم دعوا نکنیم.',
  'من و همسرم دربارهٔ میزان مجاز استفادهٔ فرزند ۷ سالهٔ‌مان از تبلت اختلاف‌نظر داریم و این اختلاف گاهی جلوی خود او هم بروز می‌کند.',
  1, 'publish_after_anonymization', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM users u WHERE u.phone_number = '+989120000105';

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, is_science_reviewed, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'professor',
  'اختلاف والدین بر سر قوانین رسانه‌ای طبیعی است، اما مهم‌تر از «چه قانونی درست است» این است که این اختلاف جلوی فرزند حل نشود. توصیهٔ من: گفت‌وگوی تعیین قانون را کاملاً به زمان و مکانی بدون حضور فرزند منتقل کنید و به یک عدد میانه (نه دقیقاً خواسته یکی از دو نفر) برسید و آن را به‌عنوان تصمیم مشترک «ما» اعلام کنید، نه تصمیم یکی از والدین.',
  'published', 1, (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'spouses-disagree-on-screen-time-rules' AND u.phone_number = '+989120000101'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'expert',
  'یک راهکار عملی: قانون را روی کاغذ یا یک برنامهٔ مشترک بنویسید (مثلاً «حداکثر ۴۵ دقیقه در روز، بعد از تکالیف») تا هر دو والد به همان مرجع نوشته‌شده ارجاع دهند، نه به حافظه یا برداشت شخصی خودشان از توافق شفاهی.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'spouses-disagree-on-screen-time-rules' AND u.phone_number = '+989120000102'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'member_experience',
  'من و همسرم هم همین مشکل را داشتیم تا اینکه یک قرارداد رسانه‌ای خانواده نوشتیم و روی یخچال چسباندیم. حالا وقتی بحث می‌شود، هر دومان به همان برگه اشاره می‌کنیم، نه به نظر شخصی خودمان.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'spouses-disagree-on-screen-time-rules' AND u.phone_number = '+989120000106'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

UPDATE responses SET root_response_id = id
WHERE question_id = (SELECT id FROM questions WHERE slug = 'spouses-disagree-on-screen-time-rules')
  AND parent_id IS NULL AND root_response_id IS NULL;

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, reply_to_display_name, published_at, created_at)
SELECT q.id, e.id, e.id, 1, mem.id, 'member',
  'ایدهٔ نوشتن روی کاغذ خیلی ساده ولی کاربردی است، حتماً امتحان می‌کنم.',
  'published', 'رضا کریمی', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users mem, responses e, users eu
WHERE q.slug = 'spouses-disagree-on-screen-time-rules'
  AND mem.phone_number = '+989120000103'
  AND eu.phone_number = '+989120000102'
  AND e.question_id = q.id AND e.parent_id IS NULL AND e.author_user_id = eu.id
  AND NOT EXISTS (SELECT 1 FROM responses r2 WHERE r2.question_id = q.id AND r2.author_user_id = mem.id AND r2.parent_id = e.id);


-- --------------------------------------------------------------
-- Thread 5: مربی و مدرسه — قلدری آنلاین در گروه کلاسی
-- --------------------------------------------------------------
INSERT OR IGNORE INTO questions (
  slug, author_user_id, author_role, context_space, age_group_id, category_id,
  is_recurring, urgency_level, raw_title, raw_what_happened, raw_since_when,
  raw_tried_so_far, raw_help_requested, public_title, public_body,
  is_anonymized, publication_choice, consent_accepted_at, status, published_at
)
SELECT
  'online-bullying-in-class-group-chat', u.id, 'mentor', 'school',
  (SELECT id FROM age_groups WHERE slug = '12_15'),
  (SELECT id FROM content_categories WHERE slug = 'mentor-and-school'),
  0, 'concerning',
  'یکی از دانش‌آموزان در گروه کلاسی مورد تمسخر قرار گرفته',
  'متوجه شدم چند نفر از دانش‌آموزان در گروه واتساپ کلاس، مدام یکی از هم‌کلاسی‌ها را با کنایه و استیکرهای توهین‌آمیز مسخره می‌کنند. آن دانش‌آموز در کلاس حاضری کم‌رنگ‌تر و منزوی‌تر شده است.',
  'حدود دو هفته',
  'یک بار در گروه به‌طور کلی گفتم رفتار محترمانه داشته باشید، اما تاثیری نداشت چون مشخص نکردم دقیقاً منظورم چیست.',
  'می‌خواهم بدانم چطور بدون برچسب زدن به کسی یا بدتر کردن وضعیت آن دانش‌آموز، این رفتار را متوقف کنم.',
  'در گروه پیام‌رسان کلاس، چند دانش‌آموز به‌طور مستمر یکی از هم‌کلاسی‌ها را مسخره می‌کنند و او منزوی‌تر شده است.',
  1, 'publish_after_anonymization', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), 'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM users u WHERE u.phone_number = '+989120000106';

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, is_science_reviewed, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'professor',
  'اعلام کلی «محترم باشید» معمولاً بی‌اثر است چون هیچ‌کس خودش را مخاطب نمی‌داند. رویکرد مؤثرتر مداخلهٔ مستقیم اما بدون رسوایی عمومی است: با دانش‌آموزانی که پیام‌های توهین‌آمیز فرستاده‌اند، جدا و خصوصی صحبت کنید و پیامدهای رفتارشان بر همکلاسی‌شان را توضیح دهید. هم‌زمان از دانش‌آموز آسیب‌دیده، بدون قضاوت، در محیطی خصوصی بپرسید چه حسی دارد و چه کمکی می‌خواهد.',
  'published', 1, (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'online-bullying-in-class-group-chat' AND u.phone_number = '+989120000101'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'expert',
  'پیشنهاد می‌کنم از استیکرها/پیام‌ها اسکرین‌شات بگیرید (برای مستندسازی)، سپس در گفت‌وگوی خصوصی با هر یک از دانش‌آموزان درگیر، رفتار مشخص را بدون تحقیرکردن آن‌ها مطرح کنید. اگر رفتار ادامه یافت، هماهنگی با مشاور مدرسه و خانواده‌های هر دو طرف ضروری می‌شود.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'online-bullying-in-class-group-chat' AND u.phone_number = '+989120000102'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, published_at, created_at)
SELECT q.id, NULL, NULL, 0, u.id, 'member_experience',
  'به‌عنوان یک مربی، تجربه‌ام این بوده که وقتی به‌جای اعلام عمومی در گروه، با هر نفر خصوصی و آرام صحبت کردم، خیلی سریع‌تر رفتار متوقف شد؛ چون کسی جلوی بقیه غرور‌شکسته نشد.',
  'published', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users u
WHERE q.slug = 'online-bullying-in-class-group-chat' AND u.phone_number = '+989120000106'
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.question_id = q.id AND r.author_user_id = u.id AND r.parent_id IS NULL);

UPDATE responses SET root_response_id = id
WHERE question_id = (SELECT id FROM questions WHERE slug = 'online-bullying-in-class-group-chat')
  AND parent_id IS NULL AND root_response_id IS NULL;

INSERT INTO responses (question_id, parent_id, root_response_id, depth, author_user_id, author_level_snapshot, body, status, reply_to_display_name, published_at, created_at)
SELECT q.id, ex.id, ex.id, 1, mem.id, 'member',
  'مستندسازی با اسکرین‌شات نکتهٔ خیلی مهمی است، به‌خصوص اگر بعداً خانواده‌ها هم درگیر شوند.',
  'published', 'رضا کریمی', (strftime('%Y-%m-%dT%H:%M:%fZ','now')), (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM questions q, users mem, responses ex, users exu
WHERE q.slug = 'online-bullying-in-class-group-chat'
  AND mem.phone_number = '+989120000105'
  AND exu.phone_number = '+989120000102'
  AND ex.question_id = q.id AND ex.parent_id IS NULL AND ex.author_user_id = exu.id
  AND NOT EXISTS (SELECT 1 FROM responses r2 WHERE r2.question_id = q.id AND r2.author_user_id = mem.id AND r2.parent_id = ex.id);

