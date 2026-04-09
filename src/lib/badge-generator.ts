import QRCode from "qrcode";

export interface BadgeData {
  firstName: string;
  lastName: string;
  email: string;
  organization?: string;
  designation?: string;
  category?: string;
  eventName: string;
  confirmationCode: string;
  qrCodeDataUrl?: string;
}

export async function generateQRCode(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    width: 160,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

function toTitleCase(str: string): string {
  // Only capitalize first letter of each word — don't lowercase the rest
  // so acronyms like CEO, CTO stay intact
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateBadgeHtml(data: BadgeData): string {
  const firstName = data.firstName.toUpperCase();
  const lastName = data.lastName.toUpperCase();
  const designation = toTitleCase(data.designation || data.organization || "");

  // Base URL for fonts — works in both local and Vercel
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    @font-face {
      font-family: 'Montserrat';
      src: url('${appUrl}/fonts/Montserrat-Light.otf') format('opentype');
      font-weight: 300;
    }
    @font-face {
      font-family: 'Montserrat';
      src: url('${appUrl}/fonts/Montserrat-SemiBold.otf') format('opentype');
      font-weight: 600;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 360px; height: 560px; overflow: hidden; }
    body { font-family: 'Montserrat', 'Arial', sans-serif; }

    /* ── Badge container ── */
    .badge {
      width: 360px;
      height: 560px;
      background-image: url('${appUrl}/badge-bg.jpg');
      background-size: cover;
      background-position: center;
      position: relative;
      overflow: hidden;
    }
  </style>
</head>
<body>
<div class="badge">

  <!-- ═══ LA GLOiRe LOGO (transparent white version) ═══ -->
  <img
    src="${appUrl}/logo-white.png"
    alt="LA GLOiRe"
    style="position:absolute; top:47px; left:0; width:240px;"
  />

  <!-- ═══ ATTENDEE NAME ═══ -->
  <div style="
    position: absolute;
    top: 185px;
    left: 28px;
    right: 18px;
    padding: 10px;
  ">
    <div style="
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 600;
      font-size: 40px;
      color: white;
      line-height: 1.05;
      text-transform: uppercase;
      word-break: break-word;
    ">${firstName}</div>
    <div style="
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 600;
      font-size: 40px;
      color: white;
      line-height: 1.05;
      text-transform: uppercase;
      word-break: break-word;
    ">${lastName}</div>
  </div>

  <!-- ═══ DESIGNATION ═══ -->
  <div style="position: absolute; top: 472px; left: 28px; right: 20px; padding: 10px;">
    <div style="
      position: relative;
      top: -135px;
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 300;
      font-size: 18px;
      color: #7dc242;
      line-height: 1.5;
      word-spacing: normal;
      letter-spacing: normal;
      white-space: normal;
    ">${designation}</div>
  </div>

  <!-- ═══ QR CODE ═══ -->
  ${data.qrCodeDataUrl ? `
  <div style="
    position: absolute;
    bottom: 20px;
    right: 20px;
    text-align: center;
  ">
    <div style="background:white; padding:5px; border-radius:5px; display:inline-block;">
      <img src="${data.qrCodeDataUrl}" alt="QR" style="display:block; width:76px; height:76px;" />
    </div>
  </div>` : ""}

</div>
</body>
</html>`;
}
