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

export function renderEmailTemplate(
  bodyHtml: string,
  headerHtml: string | null,
  footerHtml: string | null,
  variables: TemplateVariables
): string {
  let html = bodyHtml;

  // Replace template variables
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      html = html.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
  }

  // Wrap with header and footer
  const header = headerHtml
    ? headerHtml.replace(
        /{{(\w+)}}/g,
        (_, key) => variables[key] || ""
      )
    : "";

  const footer = footerHtml
    ? footerHtml.replace(
        /{{(\w+)}}/g,
        (_, key) => variables[key] || ""
      )
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .email-wrapper { max-width: 600px; margin: 0 auto; }
    .email-header { padding: 20px; }
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
  let rendered = subject;
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
  }
  return rendered;
}
