# Moderation & Safety

## 1. Crisis referral categories (spec §9.11)

The following categories, when detected (keyword match on submission, or
flagged manually by any moderator at any later point), force a question
into `private_referral` and MUST NOT be published or continued in public:

1. خطر خودآسیب‌رسانی یا خودکشی
2. کودک‌آزاری، خشونت خانوادگی یا سوءاستفاده جنسی
3. تهدید، اخاذی، باج‌گیری یا انتشار تصویر خصوصی
4. اختلال روانی حاد یا خطر فوری
5. دعوای حقوقی، حضانت، طلاق یا اتهام مشخص علیه فرد قابل‌شناسایی
6. درخواست آسیب، فریب، نفوذ یا دورزدن امنیت

Each category has an admin-editable response message template (stored in
`settings.crisis_referral_messages`, keyed by category) shown to the
submitter — never exposing any internal detail publicly.

## 2. Automatic keyword flagging

`settings.crisis_keywords` (admin-editable JSON array) is checked against
`questions.rawTitle`, `rawWhatHappened`, `rawHelpRequested` on submit.
This is a **first-pass filter only**, explicitly documented as such to
the operations team — it is NOT a clinical or legal determination. Every
match is logged to `audit_logs` (`action = 'question.auto_flagged'`) with
the matched keyword list stored in `questions.flaggedKeywords`, so false
positives/negatives can be reviewed and the keyword list tuned over time.

## 3. Moderator capabilities (spec §5.2.E)

All actions below write a `moderation_actions` row AND an `audit_logs`
row:

| Action | Effect |
|---|---|
| approve | question/response `status → approved/published` |
| reject | `status → rejected`, reason required |
| hide | `status → hidden` (response only, reversible) |
| restore | reverses `hidden`/`rejected` back to `published`/`under_review` |
| anonymize | strips identifying free text from the public version, `isAnonymized = true` |
| merge | links a duplicate question to a canonical one (`metadataJson.mergedInto`) |
| refer | creates a `question_assignments` row, targeting an expert/professor |
| restrict_user | creates a `user_restrictions` row (temporary_limit/suspension/ban) |

## 4. Report handling (spec §9.8)

`response_reports.reason` enum: `insult | personal_info | advertising |
dangerous_advice | off_topic | misinformation | other`. Every new report:
1. Creates a row with `status = 'open'`.
2. Appears in the moderator queue sorted by `reason` severity
   (`dangerous_advice`/`personal_info` prioritized) then `createdAt`.
3. On resolution, `resolvedBy`/`resolvedAt`/`status` are set and an
   `audit_logs` row is written.

A single "helpful" vote never changes moderation status and never affects
default response ranking level (spec §9.8, §2.3) — it is purely a
secondary sort key within the same `author_level_snapshot` tier.

## 5. Privacy rules enforced at the data layer

- `questions.rawTitle/rawWhatHappened/rawSinceWhen/rawTriedSoFar/rawHelpRequested`
  are only readable by sessions holding `question.view_private`
  (moderator/scientific_manager/super_admin). Experts/professors answering
  a referred question see ONLY the sanitized `publicTitle`/`publicBody` —
  never the raw submission, never the submitter's identity beyond a
  generic role label (spec §10.3, §16.1 acceptance test).
- Phone numbers are never exposed in any API response outside the user's
  own session and the auth/notification internals.
