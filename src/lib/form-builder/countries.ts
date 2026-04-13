export interface Country {
  code: string;
  name: string;
  nameAr: string;
  phoneCode: string;
}

// GCC countries first, then Arab countries, then alphabetical
export const COUNTRIES: Country[] = [
  // GCC Countries
  { code: "SA", name: "Saudi Arabia", nameAr: "السعودية", phoneCode: "+966" },
  { code: "AE", name: "United Arab Emirates", nameAr: "الإمارات", phoneCode: "+971" },
  { code: "KW", name: "Kuwait", nameAr: "الكويت", phoneCode: "+965" },
  { code: "BH", name: "Bahrain", nameAr: "البحرين", phoneCode: "+973" },
  { code: "QA", name: "Qatar", nameAr: "قطر", phoneCode: "+974" },
  { code: "OM", name: "Oman", nameAr: "عمان", phoneCode: "+968" },

  // Other Arab Countries
  { code: "EG", name: "Egypt", nameAr: "مصر", phoneCode: "+20" },
  { code: "JO", name: "Jordan", nameAr: "الأردن", phoneCode: "+962" },
  { code: "LB", name: "Lebanon", nameAr: "لبنان", phoneCode: "+961" },
  { code: "SY", name: "Syria", nameAr: "سوريا", phoneCode: "+963" },
  { code: "IQ", name: "Iraq", nameAr: "العراق", phoneCode: "+964" },
  { code: "YE", name: "Yemen", nameAr: "اليمن", phoneCode: "+967" },
  { code: "PS", name: "Palestine", nameAr: "فلسطين", phoneCode: "+970" },
  { code: "SD", name: "Sudan", nameAr: "السودان", phoneCode: "+249" },
  { code: "LY", name: "Libya", nameAr: "ليبيا", phoneCode: "+218" },
  { code: "TN", name: "Tunisia", nameAr: "تونس", phoneCode: "+216" },
  { code: "DZ", name: "Algeria", nameAr: "الجزائر", phoneCode: "+213" },
  { code: "MA", name: "Morocco", nameAr: "المغرب", phoneCode: "+212" },
  { code: "MR", name: "Mauritania", nameAr: "موريتانيا", phoneCode: "+222" },

  // International (Alphabetical)
  { code: "AF", name: "Afghanistan", nameAr: "أفغانستان", phoneCode: "+93" },
  { code: "AL", name: "Albania", nameAr: "ألبانيا", phoneCode: "+355" },
  { code: "AR", name: "Argentina", nameAr: "الأرجنتين", phoneCode: "+54" },
  { code: "AU", name: "Australia", nameAr: "أستراليا", phoneCode: "+61" },
  { code: "AT", name: "Austria", nameAr: "النمسا", phoneCode: "+43" },
  { code: "BD", name: "Bangladesh", nameAr: "بنغلاديش", phoneCode: "+880" },
  { code: "BE", name: "Belgium", nameAr: "بلجيكا", phoneCode: "+32" },
  { code: "BR", name: "Brazil", nameAr: "البرازيل", phoneCode: "+55" },
  { code: "CA", name: "Canada", nameAr: "كندا", phoneCode: "+1" },
  { code: "CN", name: "China", nameAr: "الصين", phoneCode: "+86" },
  { code: "CO", name: "Colombia", nameAr: "كولومبيا", phoneCode: "+57" },
  { code: "CZ", name: "Czech Republic", nameAr: "التشيك", phoneCode: "+420" },
  { code: "DK", name: "Denmark", nameAr: "الدنمارك", phoneCode: "+45" },
  { code: "FI", name: "Finland", nameAr: "فنلندا", phoneCode: "+358" },
  { code: "FR", name: "France", nameAr: "فرنسا", phoneCode: "+33" },
  { code: "DE", name: "Germany", nameAr: "ألمانيا", phoneCode: "+49" },
  { code: "GR", name: "Greece", nameAr: "اليونان", phoneCode: "+30" },
  { code: "HK", name: "Hong Kong", nameAr: "هونغ كونغ", phoneCode: "+852" },
  { code: "HU", name: "Hungary", nameAr: "المجر", phoneCode: "+36" },
  { code: "IN", name: "India", nameAr: "الهند", phoneCode: "+91" },
  { code: "ID", name: "Indonesia", nameAr: "إندونيسيا", phoneCode: "+62" },
  { code: "IR", name: "Iran", nameAr: "إيران", phoneCode: "+98" },
  { code: "IE", name: "Ireland", nameAr: "أيرلندا", phoneCode: "+353" },
  { code: "IT", name: "Italy", nameAr: "إيطاليا", phoneCode: "+39" },
  { code: "JP", name: "Japan", nameAr: "اليابان", phoneCode: "+81" },
  { code: "KE", name: "Kenya", nameAr: "كينيا", phoneCode: "+254" },
  { code: "KR", name: "South Korea", nameAr: "كوريا الجنوبية", phoneCode: "+82" },
  { code: "MY", name: "Malaysia", nameAr: "ماليزيا", phoneCode: "+60" },
  { code: "MX", name: "Mexico", nameAr: "المكسيك", phoneCode: "+52" },
  { code: "NL", name: "Netherlands", nameAr: "هولندا", phoneCode: "+31" },
  { code: "NZ", name: "New Zealand", nameAr: "نيوزيلندا", phoneCode: "+64" },
  { code: "NG", name: "Nigeria", nameAr: "نيجيريا", phoneCode: "+234" },
  { code: "NO", name: "Norway", nameAr: "النرويج", phoneCode: "+47" },
  { code: "PK", name: "Pakistan", nameAr: "باكستان", phoneCode: "+92" },
  { code: "PH", name: "Philippines", nameAr: "الفلبين", phoneCode: "+63" },
  { code: "PL", name: "Poland", nameAr: "بولندا", phoneCode: "+48" },
  { code: "PT", name: "Portugal", nameAr: "البرتغال", phoneCode: "+351" },
  { code: "RO", name: "Romania", nameAr: "رومانيا", phoneCode: "+40" },
  { code: "RU", name: "Russia", nameAr: "روسيا", phoneCode: "+7" },
  { code: "SG", name: "Singapore", nameAr: "سنغافورة", phoneCode: "+65" },
  { code: "ZA", name: "South Africa", nameAr: "جنوب أفريقيا", phoneCode: "+27" },
  { code: "ES", name: "Spain", nameAr: "إسبانيا", phoneCode: "+34" },
  { code: "LK", name: "Sri Lanka", nameAr: "سريلانكا", phoneCode: "+94" },
  { code: "SE", name: "Sweden", nameAr: "السويد", phoneCode: "+46" },
  { code: "CH", name: "Switzerland", nameAr: "سويسرا", phoneCode: "+41" },
  { code: "TW", name: "Taiwan", nameAr: "تايوان", phoneCode: "+886" },
  { code: "TH", name: "Thailand", nameAr: "تايلاند", phoneCode: "+66" },
  { code: "TR", name: "Turkey", nameAr: "تركيا", phoneCode: "+90" },
  { code: "UA", name: "Ukraine", nameAr: "أوكرانيا", phoneCode: "+380" },
  { code: "GB", name: "United Kingdom", nameAr: "المملكة المتحدة", phoneCode: "+44" },
  { code: "US", name: "United States", nameAr: "الولايات المتحدة", phoneCode: "+1" },
  { code: "VN", name: "Vietnam", nameAr: "فيتنام", phoneCode: "+84" },
];

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function getCountryByPhoneCode(phoneCode: string): Country | undefined {
  return COUNTRIES.find((c) => c.phoneCode === phoneCode);
}

export function getCountryOptions(language: "en" | "ar" = "en") {
  return COUNTRIES.map((c) => ({
    value: c.code,
    label: language === "ar" ? c.nameAr : c.name,
  }));
}

export function getPhoneCodeOptions() {
  return COUNTRIES.map((c) => ({
    value: c.phoneCode,
    label: `${c.phoneCode} (${c.name})`,
    country: c.code,
  }));
}
