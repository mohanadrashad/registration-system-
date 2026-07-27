// Data shapes for the branding settings page — mirror what
// /api/events/[eventId]/branding and /domain return.

export interface BrandingSettings {
  id?: string;
  primaryColor: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  logoUrl?: string;
  logoWhiteUrl?: string;
  faviconUrl?: string;
  headerImageUrl?: string;
  headerColor?: string | null;
  headerShowLogo?: boolean;
  logoHeight?: number | null;
  customCss?: string;
  welcomeTitle?: string;
  welcomeTitleAr?: string;
  welcomeMessage?: string;
  welcomeMessageAr?: string;
  footerText?: string;
  footerTextAr?: string;
}

export interface DomainSettings {
  id?: string;
  customDomain?: string;
  isVerified: boolean;
  verifiedAt?: string;
  verificationRecord?: string;
}
