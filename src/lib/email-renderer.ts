interface TemplateVariables {
  firstName?: string;
  lastName?: string;
  email?: string;
  eventName?: string;
  eventDate?: string;
  eventVenue?: string;
  registrationLink?: string;
  confirmationCode?: string;
  badgeUrl?: string;
  [key: string]: string | undefined;
}

// Variables that are URLs and may legitimately contain reserved chars.
// Their values come from the application (links we build), not end-user
// input, so escaping them would corrupt the URL. Keep this list tight.
const URL_VARIABLES = new Set(["registrationLink", "badgeUrl"]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderValue(key: string, value: string): string {
  return URL_VARIABLES.has(key) ? value : escapeHtml(value);
}

function substitute(html: string, variables: TemplateVariables): string {
  return html.replace(/{{(\w+)}}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined) return "";
    return renderValue(key, value);
  });
}

export function renderEmailTemplate(
  bodyHtml: string,
  headerHtml: string | null,
  footerHtml: string | null,
  variables: TemplateVariables
): string {
  const html = substitute(bodyHtml, variables);
  const header = headerHtml ? substitute(headerHtml, variables) : "";
  const footer = footerHtml ? substitute(footerHtml, variables) : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .email-wrapper { max-width: 600px; margin: 0 auto; }
    .email-header { padding: 0; }
    .email-body { padding: 20px; }
    .email-footer { padding: 20px; font-size: 12px; color: #666; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    ${header ? `<div class="email-header">${header}</div>` : ""}
    <div class="email-body">${html}</div>
    ${footer ? `<div class="email-footer">${footer}</div>` : ""}
  </div>
</body>
</html>`;
}

export function renderSubject(
  subject: string,
  variables: TemplateVariables
): string {
  // Subjects are plain text — collapse newlines/tabs, skip HTML escaping.
  return subject.replace(/{{(\w+)}}/g, (_, key) => {
    const value = variables[key];
    return value === undefined ? "" : value.replace(/[\r\n\t]/g, " ");
  });
}
