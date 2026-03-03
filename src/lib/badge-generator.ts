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

export function generateBadgeHtml(data: BadgeData): string {
  const firstName = data.firstName.toUpperCase();
  const lastName = data.lastName.toUpperCase();

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
    html, body { width: 360px; height: 560px; overflow: hidden; background: #4a4a4a; }
    body { font-family: 'Montserrat', 'Arial', sans-serif; }

    /* ── Badge container ── */
    .badge {
      width: 360px;
      height: 560px;
      background-color: #484848;
      position: relative;
      overflow: hidden;
    }

    /* ── Diagonal slash pattern (right side) ── */
    .slash {
      position: absolute;
      width: 55px;
      background: rgba(255,255,255,0.055);
      transform-origin: top left;
      transform: rotate(35deg);
      border-radius: 1px;
      pointer-events: none;
    }
  </style>
</head>
<body>
<div class="badge">

  <!-- Diagonal slashes on right side -->
  <div class="slash" style="left:200px; top:-60px; height:800px;"></div>
  <div class="slash" style="left:240px; top:-60px; height:800px;"></div>
  <div class="slash" style="left:280px; top:-60px; height:800px; width:65px;"></div>
  <div class="slash" style="left:320px; top:-60px; height:800px; width:45px; opacity:0.7;"></div>
  <div class="slash" style="left:160px; top:-60px; height:800px; opacity:0.5;"></div>
  <div class="slash" style="left:120px; top:-60px; height:800px; opacity:0.3;"></div>

  <!-- ═══ LA GLOiRe LOGO ═══ -->
  <!--
    Logo layout: [green rect]  LA GLO[i]Re
    The 'i' has a pink caret accent above it.
    The 'O' has a tiny green triangle element.
    Font: Montserrat Light, light gray color.
  -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    style="position:absolute; top:24px; left:0;"
    width="260" height="56"
    viewBox="0 0 260 56"
  >
    <!-- Green rectangle (separate from text) -->
    <rect x="0" y="6" width="58" height="42" fill="#7dc242"/>

    <!-- "LA GLO" text -->
    <text
      x="72" y="40"
      font-family="Montserrat, Arial, sans-serif"
      font-weight="300"
      font-size="26"
      fill="rgba(255,255,255,0.92)"
      letter-spacing="1"
    >LA GLO</text>

    <!-- Green small triangle on O (cursor-like, overlaid) -->
    <polygon points="152,28  163,35  152,42" fill="#7dc242" opacity="0.9"/>

    <!-- lowercase 'i' -->
    <text
      x="168" y="40"
      font-family="Montserrat, Arial, sans-serif"
      font-weight="300"
      font-size="26"
      fill="rgba(255,255,255,0.92)"
      letter-spacing="1"
    >i</text>
    <!-- Pink caret/triangle accent above 'i' (replaces dot) -->
    <polygon points="172,8  168,16  176,16" fill="#c2185b"/>

    <!-- "Re" text -->
    <text
      x="180" y="40"
      font-family="Montserrat, Arial, sans-serif"
      font-weight="300"
      font-size="26"
      fill="rgba(255,255,255,0.92)"
      letter-spacing="1"
    >Re</text>

    <!-- Tagline -->
    <text
      x="72" y="52"
      font-family="Montserrat, Arial, sans-serif"
      font-weight="300"
      font-size="6"
      fill="rgba(255,255,255,0.45)"
      letter-spacing="2.5"
    >Our Commitment Is Your Success</text>
  </svg>

  <!-- ═══ ATTENDEE NAME ═══ -->
  <div style="
    position: absolute;
    top: 185px;
    left: 28px;
    right: 18px;
  ">
    <div style="
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 600;
      font-size: 46px;
      color: white;
      line-height: 1.05;
      text-transform: uppercase;
      word-break: break-word;
    ">${firstName}</div>
    <div style="
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 600;
      font-size: 46px;
      color: white;
      line-height: 1.05;
      text-transform: uppercase;
      word-break: break-word;
    ">${lastName}</div>
  </div>

  <!-- ═══ DESIGNATION ═══ -->
  <div style="
    position: absolute;
    top: 378px;
    left: 28px;
    right: 90px;
  ">
    <div style="
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 300;
      font-size: 14px;
      color: #7dc242;
      line-height: 1.5;
    ">${data.designation || data.organization || ""}</div>
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
    <div style="margin-top:4px; font-size:7px; color:rgba(255,255,255,0.35); font-family:monospace; letter-spacing:1px;">${data.confirmationCode}</div>
  </div>` : ""}

</div>
</body>
</html>`;
}
