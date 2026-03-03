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
      background-color: #3f3f3f;
      position: relative;
      overflow: hidden;
    }

    /* ── Diagonal slash pattern — full badge width ── */
    .slash {
      position: absolute;
      background: rgba(255,255,255,0.06);
      transform-origin: top left;
      transform: rotate(35deg);
      pointer-events: none;
    }
  </style>
</head>
<body>
<div class="badge">

  <!-- Diagonal slashes covering full badge (bottom-left to top-right) -->
  <div class="slash" style="left:30px;  top:-80px; width:30px; height:900px; opacity:0.4;"></div>
  <div class="slash" style="left:80px;  top:-80px; width:50px; height:900px; opacity:0.5;"></div>
  <div class="slash" style="left:140px; top:-80px; width:30px; height:900px; opacity:0.6;"></div>
  <div class="slash" style="left:185px; top:-80px; width:55px; height:900px;"></div>
  <div class="slash" style="left:250px; top:-80px; width:35px; height:900px; opacity:0.7;"></div>
  <div class="slash" style="left:295px; top:-80px; width:55px; height:900px;"></div>
  <div class="slash" style="left:358px; top:-80px; width:35px; height:900px; opacity:0.8;"></div>

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
    top: 400px;
    left: 28px;
    right: 100px;
  ">
    <div style="
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 300;
      font-size: 16px;
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
