import { describe, it, expect } from 'vitest'
import {
  createToolService,
  computeFamilyAgreementResult,
  computePhoneReadinessResult,
  computeMediaStyleResult,
  FAMILY_VALUES,
  CLAUSE_LIBRARY,
  RESTORATIVE_ACTIONS,
} from '../src/services/tool.service'
import type { ToolRepository, ToolRecord, ToolSubmissionRecord, CreateSubmissionInput } from '../src/repositories/tool.repository'

function fakeRepo(overrides: Partial<ToolRepository> = {}): ToolRepository {
  const submissions: ToolSubmissionRecord[] = []
  let nextId = 1
  return {
    async findBySlug(slug) {
      return { id: 1, slug, titleFa: 'x', description: null, pdfTemplateKey: `${slug}_v1`, isActive: true } as ToolRecord
    },
    async findById(id) {
      return { id, slug: 'family_media_contract', titleFa: 'x', description: null, pdfTemplateKey: 'v1', isActive: true }
    },
    async listActive() {
      return []
    },
    async createSubmission(input: CreateSubmissionInput) {
      const row: ToolSubmissionRecord = { id: nextId++, toolId: input.toolId, userId: input.userId, answersJson: input.answersJson, resultJson: input.resultJson, createdAt: 'now' }
      submissions.push(row)
      return row
    },
    async findSubmissionById(id) {
      return submissions.find((s) => s.id === id) ?? null
    },
    async createPdfExport() {
      throw new Error('not used in this test')
    },
    async findLatestPdfExportForSubmission() {
      return null
    },
    async updatePdfExportStatus() {},
    ...overrides,
  }
}

/** Minimal valid family-agreement input builder, so each test only overrides what it cares about. */
function baseFamilyAgreementInput(overrides: Record<string, unknown> = {}) {
  return {
    familyMembers: [{ name: 'مادر', role: 'parent' as const }, { name: 'آرش', role: 'child' as const }],
    familyValueKeys: ['trust', 'calm', 'respect'],
    devices: ['mobile', 'tablet'],
    selectedClauseKeys: ['screen_time', 'family_time'],
    customParentCommitments: [],
    customChildCommitments: [],
    restorativeActionKeys: ['help_housework'],
    reviewDate: '2026-01-01',
    ...overrides,
  }
}

describe('computeFamilyAgreementResult — warm/pedagogical redesign', () => {
  it('generates an intro paragraph from the chosen family values (client directive §2)', () => {
    const result = computeFamilyAgreementResult(baseFamilyAgreementInput())
    expect(result.familyValuesFa).toEqual(['اعتماد', 'آرامش', 'احترام'])
    expect(result.introFa).toContain('اعتماد')
    expect(result.introFa).toContain('آرامش')
    expect(result.introFa).toContain('احترام')
    // Exact spec wording anchors, not full-string match (allows minor phrasing flexibility).
    expect(result.introFa).toContain('بسته می‌شود')
    expect(result.introFa).toContain('امن‌تر، آرام‌تر و شادتر')
  })

  it('never uses imperative/prohibitive language ("ممنوع است"/"ملزم است") anywhere in generated text', () => {
    const result = computeFamilyAgreementResult(baseFamilyAgreementInput())
    const allText = [result.introFa, result.closingFa, result.summaryFa, ...result.clauses.flatMap((c) => [c.parentTextFa, c.childTextFa])].join(' ')
    expect(allText).not.toContain('ممنوع است')
    expect(allText).not.toContain('ملزم است')
    expect(allText).not.toContain('جریمه')
  })

  it('resolves selected clause keys into mutual (parent + child) commitment text', () => {
    const result = computeFamilyAgreementResult(baseFamilyAgreementInput())
    expect(result.clauses).toHaveLength(2)
    const screenTime = result.clauses.find((c) => c.key === 'screen_time')!
    expect(screenTime.parentTextFa).toContain('ما توافق می‌کنیم')
    expect(screenTime.childTextFa).toContain('من متعهد می‌شوم')
  })

  it('resolves restorative action keys into labels, never the word "جریمه"', () => {
    const result = computeFamilyAgreementResult(baseFamilyAgreementInput())
    expect(result.restorativeActionsFa).toEqual(['کمک در یکی از کارهای خانه (مثل شستن ظرف‌ها یا جمع‌کردن اتاق)'])
  })

  it('uses the exact mandated closing wording (client directive §4)', () => {
    const result = computeFamilyAgreementResult(baseFamilyAgreementInput())
    expect(result.closingFa).toBe('ما با امضای این برگه، قول می‌دهیم هوای هم را داشته باشیم و اگر جایی اشتباه کردیم، با مهربانی به هم یادآوری کنیم.')
  })

  it('includes custom (free-text) parent/child commitments when provided', () => {
    const result = computeFamilyAgreementResult(
      baseFamilyAgreementInput({ customParentCommitments: ['ما توافق می‌کنیم هفته‌ای یک شب بدون گوشی داشته باشیم.'], customChildCommitments: ['من متعهد می‌شوم قبل از خواب گوشی را بسپارم.'] }),
    )
    expect(result.customParentCommitments).toEqual(['ما توافق می‌کنیم هفته‌ای یک شب بدون گوشی داشته باشیم.'])
    expect(result.customChildCommitments).toEqual(['من متعهد می‌شوم قبل از خواب گوشی را بسپارم.'])
  })

  it('falls back to a generic mutual clause if an unknown clause key is passed (defensive)', () => {
    const result = computeFamilyAgreementResult(baseFamilyAgreementInput({ selectedClauseKeys: ['not_a_real_key'] }))
    expect(result.clauses).toHaveLength(1)
    expect(result.clauses[0].parentTextFa).toContain('ما توافق می‌کنیم')
  })
})

describe('FAMILY_VALUES / CLAUSE_LIBRARY / RESTORATIVE_ACTIONS catalogues', () => {
  it('exposes at least 5 family values to choose 3-5 from', () => {
    expect(FAMILY_VALUES.length).toBeGreaterThanOrEqual(5)
  })
  it('every clause library entry has both a parent and a child commitment text', () => {
    for (const clause of CLAUSE_LIBRARY) {
      expect(clause.parentTextFa.length).toBeGreaterThan(0)
      expect(clause.childTextFa.length).toBeGreaterThan(0)
    }
  })
  it('no restorative action label uses punitive language', () => {
    for (const action of RESTORATIVE_ACTIONS) {
      expect(action.labelFa).not.toContain('جریمه')
      expect(action.labelFa).not.toContain('تنبیه')
    }
  })
})

describe('computePhoneReadinessResult', () => {
  it('returns "ready" for uniformly high scores', () => {
    const answers: Record<string, number> = {}
    const keys = ['keeps_promises', 'handles_disappointment', 'follows_home_rules', 'school_communication_need', 'safety_need', 'social_need', 'screen_time_history', 'device_care_history', 'honesty_history', 'homework_priority', 'sleep_schedule', 'self_regulation']
    keys.forEach((k) => (answers[k] = 5))
    const result = computePhoneReadinessResult(answers)
    expect(result.verdict).toBe('ready')
  })

  it('forces needs_more_practice when trackRecord is very low regardless of other axes', () => {
    const answers: Record<string, number> = {
      keeps_promises: 5, handles_disappointment: 5, follows_home_rules: 5,
      school_communication_need: 5, safety_need: 5, social_need: 5,
      screen_time_history: 1, device_care_history: 1, honesty_history: 1,
      homework_priority: 5, sleep_schedule: 5, self_regulation: 5,
    }
    const result = computePhoneReadinessResult(answers)
    expect(result.verdict).toBe('needs_more_practice')
  })

  it('clamps out-of-range/missing answers defensively', () => {
    const result = computePhoneReadinessResult({ keeps_promises: 99, handles_disappointment: -3 })
    expect(result.axisScores.behavioralMaturity).toBeGreaterThanOrEqual(1)
    expect(result.axisScores.behavioralMaturity).toBeLessThanOrEqual(5)
  })
})

describe('computeMediaStyleResult', () => {
  it('classifies axes into strength/developing/challenge and builds a 7-day plan', () => {
    const answers: Record<string, number> = {
      clear_time_limits: 5, consistent_enforcement: 5, device_free_zones: 5,
      own_screen_time: 1, model_offline_activities: 1, admit_mistakes: 1,
    }
    const result = computeMediaStyleResult(answers)
    const rules = result.axisScores.find((a) => a.axis === 'rulesBoundaries')!
    const modeling = result.axisScores.find((a) => a.axis === 'modeling')!
    expect(rules.classification).toBe('strength')
    expect(modeling.classification).toBe('challenge')
    expect(result.strengthsFa).toContain(rules.labelFa)
    expect(result.challengesFa).toContain(modeling.labelFa)
    expect(result.sevenDayPlan.length).toBe(7)
  })
})

describe('ToolService.submitFamilyAgreement', () => {
  it('does NOT persist a submission for anonymous (userId=null) preview', async () => {
    const service = createToolService(fakeRepo())
    const { submissionId } = await service.submitFamilyAgreement(baseFamilyAgreementInput(), null)
    expect(submissionId).toBeNull()
  })

  it('persists a submission when a userId is present', async () => {
    const service = createToolService(fakeRepo())
    const { submissionId } = await service.submitFamilyAgreement(baseFamilyAgreementInput(), 42)
    expect(submissionId).toBe(1)
  })
})

describe('ToolService.getOwnedSubmission (ownership / privacy gate)', () => {
  it('denies access to a submission owned by a different user', async () => {
    const repo = fakeRepo()
    const service = createToolService(repo)
    const { submissionId } = await service.submitFamilyAgreement(baseFamilyAgreementInput(), 42)
    const result = await service.getOwnedSubmission(submissionId!, 999, false)
    expect(result).toBeNull()
  })

  it('allows the owner to access their own submission', async () => {
    const repo = fakeRepo()
    const service = createToolService(repo)
    const { submissionId } = await service.submitFamilyAgreement(baseFamilyAgreementInput(), 42)
    const result = await service.getOwnedSubmission(submissionId!, 42, false)
    expect(result).not.toBeNull()
  })

  it('allows admin override to access any submission regardless of owner', async () => {
    const repo = fakeRepo()
    const service = createToolService(repo)
    const { submissionId } = await service.submitFamilyAgreement(baseFamilyAgreementInput(), 42)
    const result = await service.getOwnedSubmission(submissionId!, 999, true)
    expect(result).not.toBeNull()
  })

  it('returns null for a non-existent submission id', async () => {
    const service = createToolService(fakeRepo())
    const result = await service.getOwnedSubmission(9999, 1, false)
    expect(result).toBeNull()
  })
})
