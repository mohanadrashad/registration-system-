const DANGEROUS_PATTERNS = [
  /<\/?\s*style/gi,
  /<\/?\s*script/gi,
  /expression\s*\(/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:\s*text\/html/gi,
  /behavior\s*:/gi,
  /@import\b/gi,
  /-moz-binding\s*:/gi,
];

export function sanitizeCss(css: string | null | undefined): string {
  if (!css) return "";

  let cleaned = css.replace(/[<>]/g, "");
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.slice(0, 50_000);
}
