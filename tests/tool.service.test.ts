import { describe, it, expect } from 'vitest'
import {
  createToolService,
  computeFamilyAgreementResult,
  computePhoneReadinessResult,
  computeMediaStyleResult,
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

describe('computeFamilyAgreementResult', () => {
  it('builds a summary mentioning all family members', () => {
    const result = computeFamilyAgreementResult({
      familyMembers: [{ name: 'مادر', role: 'parent' }, { name: 'آرش', role: 'child' }],
      devices: ['mobile', 'tablet'],
      sensitiveSituations: ['bedtime_screens'],
      parentCommitments: ['a'],
      childCommitments: ['b'],
      reviewDate: '2026-01-01',
    })
    expect(result.sensitiveSituationLabels).toEqual(['استفاده از صفحه‌نمایش پیش از خواب'])
    expect(result.summaryFa).toContain('2')
    expect(result.summaryFa).toContain('مادر')
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
    const { submissionId } = await service.submitFamilyAgreement(
      { familyMembers: [{ name: 'A', role: 'parent' }], devices: [], sensitiveSituations: [], parentCommitments: [], childCommitments: [], reviewDate: '2026-01-01' },
      null,
    )
    expect(submissionId).toBeNull()
  })

  it('persists a submission when a userId is present', async () => {
    const service = createToolService(fakeRepo())
    const { submissionId } = await service.submitFamilyAgreement(
      { familyMembers: [{ name: 'A', role: 'parent' }], devices: [], sensitiveSituations: [], parentCommitments: [], childCommitments: [], reviewDate: '2026-01-01' },
      42,
    )
    expect(submissionId).toBe(1)
  })
})

describe('ToolService.getOwnedSubmission (ownership / privacy gate)', () => {
  it('denies access to a submission owned by a different user', async () => {
    const repo = fakeRepo()
    const service = createToolService(repo)
    const { submissionId } = await service.submitFamilyAgreement(
      { familyMembers: [{ name: 'A', role: 'parent' }], devices: [], sensitiveSituations: [], parentCommitments: [], childCommitments: [], reviewDate: '2026-01-01' },
      42,
    )
    const result = await service.getOwnedSubmission(submissionId!, 999, false)
    expect(result).toBeNull()
  })

  it('allows the owner to access their own submission', async () => {
    const repo = fakeRepo()
    const service = createToolService(repo)
    const { submissionId } = await service.submitFamilyAgreement(
      { familyMembers: [{ name: 'A', role: 'parent' }], devices: [], sensitiveSituations: [], parentCommitments: [], childCommitments: [], reviewDate: '2026-01-01' },
      42,
    )
    const result = await service.getOwnedSubmission(submissionId!, 42, false)
    expect(result).not.toBeNull()
  })

  it('allows admin override to access any submission regardless of owner', async () => {
    const repo = fakeRepo()
    const service = createToolService(repo)
    const { submissionId } = await service.submitFamilyAgreement(
      { familyMembers: [{ name: 'A', role: 'parent' }], devices: [], sensitiveSituations: [], parentCommitments: [], childCommitments: [], reviewDate: '2026-01-01' },
      42,
    )
    const result = await service.getOwnedSubmission(submissionId!, 999, true)
    expect(result).not.toBeNull()
  })

  it('returns null for a non-existent submission id', async () => {
    const service = createToolService(fakeRepo())
    const result = await service.getOwnedSubmission(9999, 1, false)
    expect(result).toBeNull()
  })
})
