import type { PortalLang } from "@/lib/portal/i18n";

// ─── Page-local bilingual strings ─────────────────────────────────────
//
// Kept inline rather than in a shared i18n module — the portal post-
// login flow doesn't have a translation infrastructure yet, and the
// surface area is small. If a third language ever lands, lift this
// out to src/lib/i18n/.
export const PAGE_STRINGS = {
  en: {
    backToPortal: "Back to portal",
    logout: "Log out",
    locked: "Locked",
    closed: "View only",
    closes: (when: string) => `Closes ${when}`,
    submittedAt: (when: string) => `Submitted ${when}`,
    lastEdited: (when: string) => `last edited ${when}`,
    stepLabel: (n: number, total: number) => `Step ${n} of ${total}`,
    requiredFields:
      "Please complete the required fields before continuing.",
    submissionFailed: "Submission failed",
    networkFailed:
      "Submission failed. Check your connection and try again.",
    optionFullFallback:
      "An option you picked just filled up. Please pick another and resubmit.",
    selectionsConcurrency:
      "Your selection was updated elsewhere. Reloading the latest…",
    saving: "Saving…",
    submit: "Submit",
    update: "Update",
    next: "Next",
    back: "Back",
    saved: "Saved",
    savedBody: (title: string) =>
      `Your response to "${title}" has been submitted. You can come back and edit it anytime until the phase closes.`,
    pleaseSpecify: "Please specify",
    pleaseSpecifyError: "Please specify your answer",
    counterBelow: (n: number, max: number) => `${n} of ${max} selected`,
    counterAtLimit: (max: number) => `Maximum reached — ${max} of ${max}`,
    maxReachedTooltip: (max: number) =>
      `Maximum ${max} selections reached. Uncheck one to choose a different option.`,
    languageToggle: "العربية",
  },
  ar: {
    backToPortal: "العودة إلى البوابة",
    logout: "تسجيل الخروج",
    locked: "مقفل",
    closed: "عرض فقط",
    closes: (when: string) => `تُغلق في ${when}`,
    submittedAt: (when: string) => `أُرسل في ${when}`,
    lastEdited: (when: string) => `آخر تعديل ${when}`,
    stepLabel: (n: number, total: number) => `الخطوة ${n} من ${total}`,
    requiredFields:
      "يُرجى إكمال الحقول المطلوبة قبل المتابعة.",
    submissionFailed: "فشل الإرسال",
    networkFailed: "فشل الإرسال. تحقق من اتصالك وحاول مرة أخرى.",
    optionFullFallback:
      "أحد الخيارات التي اخترتها أصبح ممتلئًا. يُرجى اختيار خيار آخر وإعادة الإرسال.",
    selectionsConcurrency:
      "تم تحديث اختيارك من مكان آخر. جارٍ إعادة تحميل أحدث نسخة…",
    saving: "جارٍ الحفظ…",
    submit: "إرسال",
    update: "تحديث",
    next: "التالي",
    back: "رجوع",
    saved: "تم الحفظ",
    savedBody: (title: string) =>
      `تم إرسال إجابتك على "${title}". يمكنك الرجوع وتعديلها في أي وقت قبل إغلاق المرحلة.`,
    pleaseSpecify: "يرجى التحديد",
    pleaseSpecifyError: "يرجى تحديد إجابتك",
    counterBelow: (n: number, max: number) => `${n} من ${max} محدد`,
    counterAtLimit: (max: number) =>
      `تم بلوغ الحد الأقصى — ${max} من ${max}`,
    maxReachedTooltip: (max: number) =>
      `تم بلوغ الحد الأقصى ${max}. ألغِ خيارًا لاختيار آخر.`,
    languageToggle: "English",
  },
} as const;

// The active-language string table (t) — what components receive as a prop.
export type PageT = (typeof PAGE_STRINGS)[PortalLang];
