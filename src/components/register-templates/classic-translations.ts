export type ClassicLang = "ar" | "en";

export const translations = {
  ar: {
    title: "تسجيل الحضور",
    description: "يرجى تعبئة بياناتك للتسجيل",
    register: "تأكيد التسجيل",
    registering: "جاري التسجيل...",
    successTitle: "تم التسجيل بنجاح!",
    successMessage: "شكراً لتسجيلك. نتطلع لرؤيتك هناك!",
    switchLang: "English",
    loading: "جاري التحميل...",
    eventNotFound: "الفعالية غير موجودة",
    required: "مطلوب",
    next: "التالي",
    back: "السابق",
    stepOf: (current: number, total: number) => `الخطوة ${current} من ${total}`,
    draftRestored: "تم استرجاع بياناتك من زيارتك السابقة.",
    startOver: "البدء من جديد",
    fillRequired: "يرجى إكمال الحقول المطلوبة قبل المتابعة.",
    pleaseSpecify: "يرجى التحديد",
    pleaseSpecifyError: "يرجى تحديد إجابتك",
    networkError:
      "تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.",
    counterBelow: (n: number, max: number) => `${n} من ${max} محدد`,
    counterAtLimit: (max: number) =>
      `تم بلوغ الحد الأقصى — ${max} من ${max}`,
    maxReachedTooltip: (max: number) =>
      `تم بلوغ الحد الأقصى ${max}. ألغِ خيارًا لاختيار آخر.`,
  },
  en: {
    title: "Event Registration",
    description: "Fill in your details to register",
    register: "Confirm Registration",
    registering: "Registering...",
    successTitle: "Registration Successful!",
    successMessage: "Thank you for registering. We look forward to seeing you there!",
    switchLang: "العربية",
    loading: "Loading...",
    eventNotFound: "Event not found",
    required: "Required",
    next: "Next",
    back: "Back",
    stepOf: (current: number, total: number) => `Step ${current} of ${total}`,
    draftRestored: "Resumed from your last visit.",
    startOver: "Start over",
    fillRequired: "Please complete the required fields before continuing.",
    pleaseSpecify: "Please specify",
    pleaseSpecifyError: "Please specify your answer",
    networkError:
      "Could not reach the server. Please check your connection and try again.",
    counterBelow: (n: number, max: number) => `${n} of ${max} selected`,
    counterAtLimit: (max: number) => `Maximum reached — ${max} of ${max}`,
    maxReachedTooltip: (max: number) =>
      `Maximum ${max} selections reached. Uncheck one to choose a different option.`,
  },
};

// The active-language string table (t) — what ClassicField receives as a prop.
export type ClassicT = (typeof translations)[ClassicLang];
