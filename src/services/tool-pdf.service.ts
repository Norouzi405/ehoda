/**
 * Builds the PdfDocumentInput for each of the 3 tools (spec §11: "اتصال
 * موتور PDF فارسی استاندارد" — Vazirmatn/RTL/attractive layout). This
 * module ONLY builds a `PdfDocumentInput` object and passes it to the
 * shared `renderPdfDocumentHtml()` template (src/services/pdf-template.service.ts)
 * — it never touches the PdfAdapter/R2 boundary itself (portability rule
 * 3.6), so it stays a pure, framework-free function like the rest of the
 * Service layer (rule 3.1).
 */
import { renderPdfDocumentHtml, type PdfDocumentInput } from './pdf-template.service'
import { formatJalaliDateFa } from '../lib/jalali'
import {
  DEVICE_OPTIONS,
  type FamilyAgreementResult,
  type PhoneReadinessResult,
  PHONE_READINESS_AXES,
  type MediaStyleResult,
} from './tool.service'

function deviceLabels(keys: string[]): string[] {
  return keys.map((k) => DEVICE_OPTIONS.find((d) => d.key === k)?.labelFa ?? k)
}

export function buildFamilyAgreementPdfDoc(result: FamilyAgreementResult, generatedAt: Date = new Date()): PdfDocumentInput {
  return {
    title: 'قرارداد رسانه‌ای خانواده',
    subtitle: 'تنظیم‌شده به‌صورت شخصی‌سازی‌شده — پلتفرم «خانواده و رسانه»',
    generatedAtFa: formatJalaliDateFa(generatedAt),
    sections: [
      {
        heading: 'اعضای خانواده',
        list: result.familyMembers.map((m) => `${m.name} (${m.role === 'parent' ? 'والد' : 'فرزند'})`),
      },
      {
        heading: 'دستگاه‌های تحت پوشش این توافق',
        list: deviceLabels(result.devices),
      },
      {
        heading: 'موقعیت‌های حساس شناسایی‌شده',
        list: result.sensitiveSituationLabels,
      },
      {
        heading: 'تعهدهای والدین',
        list: result.parentCommitments,
      },
      {
        heading: 'تعهدهای فرزند',
        list: result.childCommitments,
      },
      {
        heading: 'زمان بازبینی ماهانه',
        paragraphs: [`این توافق در تاریخ ${result.reviewDate} و سپس هر ماه یک‌بار، با حضور همهٔ اعضا بازبینی می‌شود.`, result.summaryFa],
      },
    ],
    footerNote: 'این سند صرفاً جهت راهنمایی خانواده تهیه شده و جای مشاوره تخصصی را نمی‌گیرد.',
  }
}

export function buildPhoneReadinessPdfDoc(result: PhoneReadinessResult, generatedAt: Date = new Date()): PdfDocumentInput {
  const axisLines = PHONE_READINESS_AXES.map((a) => `${a.labelFa}: ${result.axisScores[a.key].toFixed(1)} از ۵`)
  return {
    title: 'چک‌لیست آمادگی دریافت گوشی شخصی',
    subtitle: `نتیجهٔ ارزیابی: ${result.verdictLabelFa}`,
    generatedAtFa: formatJalaliDateFa(generatedAt),
    sections: [
      {
        heading: 'امتیاز هر محور',
        list: axisLines,
      },
      {
        heading: 'نتیجهٔ کلی',
        paragraphs: [`میانگین کلی: ${result.overallScore.toFixed(1)} از ۵ — نتیجه: ${result.verdictLabelFa}`],
      },
      {
        heading: 'پیشنهادهای عملی',
        list: result.recommendationsFa,
      },
    ],
    footerNote: 'این ارزیابی راهنمای گفت‌وگوی خانواده است، نه یک حکم قطعی؛ تصمیم نهایی با والدین و بر اساس شرایط خاص فرزند است.',
  }
}

export function buildMediaStyleQuizPdfDoc(result: MediaStyleResult, generatedAt: Date = new Date()): PdfDocumentInput {
  return {
    title: 'آزمون سبک رسانه‌ای خانواده',
    subtitle: 'شناسایی نقاط قوت و حوزه‌های نیازمند توجه',
    generatedAtFa: formatJalaliDateFa(generatedAt),
    sections: [
      {
        heading: 'امتیاز هر محور',
        list: result.axisScores.map((a) => `${a.labelFa}: ${a.score.toFixed(1)} از ۵`),
      },
      {
        heading: 'نقاط قوت خانواده',
        list: result.strengthsFa.length ? result.strengthsFa : ['در این ارزیابی نقطهٔ قوت برجسته‌ای ثبت نشد؛ روی برنامهٔ ۷ روزه تمرکز کنید.'],
      },
      {
        heading: 'حوزه‌های نیازمند توجه',
        list: result.challengesFa.length ? result.challengesFa : ['حوزهٔ چالش‌برانگیز خاصی شناسایی نشد.'],
      },
      {
        heading: 'برنامهٔ عملی ۷ روزه',
        list: result.sevenDayPlan.map((d) => `روز ${d.day} — ${d.titleFa}: ${d.actionFa}`),
      },
    ],
    footerNote: 'این آزمون یک ابزار خودآگاهی خانواده است و جای ارزیابی تخصصی روان‌شناسی را نمی‌گیرد.',
  }
}

export function renderToolPdfHtml(toolSlug: string, result: unknown): string {
  switch (toolSlug) {
    case 'family_media_contract':
      return renderPdfDocumentHtml(buildFamilyAgreementPdfDoc(result as FamilyAgreementResult))
    case 'phone_readiness_checklist':
      return renderPdfDocumentHtml(buildPhoneReadinessPdfDoc(result as PhoneReadinessResult))
    case 'media_style_quiz':
      return renderPdfDocumentHtml(buildMediaStyleQuizPdfDoc(result as MediaStyleResult))
    default:
      throw new Error(`unknown_tool_pdf_template:${toolSlug}`)
  }
}
