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
