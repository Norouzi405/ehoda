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
