# Roles and Permissions Matrix

RBAC model: a user can hold multiple `roles`; each `role` has a set of
`permissions`; a user can additionally receive a direct permission
override via `model_has_permissions`. Enforcement happens ONLY server-side
(Hono middleware `requirePermission(key)` — see `src/middleware/rbac.ts`),
never trusted from the client. Deny-by-default: a route with no explicit
permission check on a mutating action is a bug.

## Roles (`roles.key`)

| key | Persian label | Summary |
|---|---|---|
| `member` | عضو جامعه | parents/teachers/mentors — the core Q&A contributor base |
| `expert` | مدرس/کارشناس تأییدشده | verified professional, distinct badge, tier 2 ranking |
| `professor` | استاد تربیت رسانه‌ای | top verified authority, tier 1 ranking |
| `moderator` | ناظر پرسش‌کده و جامعه | content moderation, anonymization, referral |
| `scientific_manager` | مدیر علمی | invites/approves professionals, editor picks, science-reviewed badge |
| `super_admin` | مدیر اصلی سامانه | full access, role/permission management, audit log |

`guest` is not a stored role — it is simply "no session" and is handled
by route-level auth checks, not RBAC.

## Permission groups (`permissions.group`) — representative keys

| Group | Example keys |
|---|---|
| `question` | `question.create`, `question.view_private`, `question.moderate`, `question.assign` |
| `response` | `response.create`, `response.reply`, `response.edit_own`, `response.moderate`, `response.editor_pick`, `response.science_review` |
| `professional` | `professional.invite`, `professional.approve`, `professional.manage_expertise` |
| `content` | `content.create`, `content.publish`, `content.manage_categories` |
| `moderation` | `moderation.view_queue`, `moderation.resolve_report`, `moderation.restrict_user` |
| `settings` | `settings.manage`, `settings.manage_rate_limits`, `settings.manage_crisis_messages` |
| `audit` | `audit.view` |

## Role → permission defaults (seed data, admin-editable afterwards)

| Permission | member | expert | professor | moderator | scientific_manager | super_admin |
|---|---|---|---|---|---|---|
| question.create | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| question.view_private | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| question.moderate | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| question.assign | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| response.create / reply | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| response.edit_own | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| response.moderate | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| response.editor_pick | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| response.science_review | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| professional.invite / approve | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| content.publish | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| moderation.restrict_user | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| settings.manage | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| audit.view | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

Note: `expert` and `professor` are answer-authoring roles, not moderation
roles — they never get `response.moderate` or `question.moderate` per
spec §5.2.C/D ("عدم امکان حذف پاسخ دیگران").

## Profile type vs. access role (spec §5.1)

`profiles.profileType` (`father|mother|teacher|mentor|school_counselor|other`)
is purely a DISPLAY attribute for `member` users — it never grants or
implies any permission. The response card badge logic
(`ResponseCardService`) maps it to one of: «والد», «مربی/معلم», «عضو
جامعه» — independent of the RBAC role check.

## Default response ranking (spec §9.3, implemented in `ResponseRankingService`)

```
sort_key = (level_rank ASC, is_editor_pick DESC, secondary_sort)

level_rank:
  professor          -> 1
  expert             -> 2
  member_experience  -> 3   (member who tagged the response as "تجربه")
  member             -> 4

secondary_sort (user-selectable in UI):
  default   -> created_at DESC (within each level_rank)
  newest    -> created_at DESC (ignores level_rank grouping)
  helpful   -> helpful_votes_count DESC (ignores level_rank grouping)
  all       -> flat chronological, no level grouping
```

`author_level_snapshot` is what `level_rank` reads from — never the
user's current role — per the historical-stability requirement in
`database-schema.md`. Ranking is applied ONLY at the top level of a
question's response tree (`buildResponseTree()` in
`response.service.ts`); replies nested under a top-level response are
always ordered chronologically and are never re-ranked by tier — a
professor's reply does not jump above an earlier member reply in the
same thread. Covered by `tests/response.service.test.ts`.

## Tombstone-on-delete (spec §2.3/D-013, `response.moderate` / own-author only)

Deleting a response — whether by its own author (`response.edit_own`,
self-service) or by a moderator (`response.moderate`) — NEVER physically
removes the row. `ResponseRepository.tombstone()` sets `is_tombstone = 1`
and replaces `body` with one canonical placeholder string
(`"[این نظر توسط کاربر/ناظر حذف شده است]"`), identical regardless of who
performed the delete. This preserves the `parent_id`/`root_response_id`
chain so any replies underneath the deleted response continue to resolve
and render correctly — the thread structure never breaks. Covered by
`tests/response.service.test.ts`.

## Question privacy boundary (spec §10.3/§16.1, `question.view_private`)

`QuestionService.getRawForViewer(slug, viewerUserId, canViewPrivate)` is
the single gate between a question's raw/private fields (author's real
`rawTitle`, `rawWhatHappened`, `rawSinceWhen`, `rawTriedSoFar`,
`rawHelpRequested`, and `authorUserId`, which is how the author's phone
number is reachable) and any non-authorized caller:

- The question's own author, or any caller holding
  `question.view_private` (moderator/scientific_manager/super_admin) —
  gets the full raw record.
- Anyone else viewing a `published` question — gets a **stripped** copy:
  `authorUserId: 0`, and all raw text fields reset to `''`/`null`. Only
  the moderator-curated `publicTitle`/`publicBody` (already anonymized
  during moderation) are shown.
- Anyone else viewing a non-`published` question — gets `null` (404 at
  the route layer), not even the stripped copy.

This is the mechanism that prevents mobile-number/questioner-identity
disclosure in any public output. Covered by
`tests/question.service.test.ts`.
