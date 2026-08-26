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
`database-schema.md`.
