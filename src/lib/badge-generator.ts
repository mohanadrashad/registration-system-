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
  // Split name: if name is long, show first name and last name on separate lines
  const firstName = data.firstName.toUpperCase();
  const lastName = data.lastName.toUpperCase();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 360px; height: 560px; overflow: hidden; }
    body { font-family: 'Montserrat', 'Arial Black', Arial, sans-serif; }

    .badge {
      width: 360px;
      height: 560px;
      background-color: #4a4a4a;
      color: white;
      position: relative;
      overflow: hidden;
    }

    /* ── Diagonal slash background pattern ── */
    .slashes {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }
    .slash {
      position: absolute;
      width: 60px;
      background: rgba(255,255,255,0.06);
      transform-origin: top center;
      transform: rotate(-35deg);
      border-radius: 2px;
    }

    /* ── Logo area ── */
    .logo-area {
      position: absolute;
      top: 28px;
      left: 0;
      display: flex;
      align-items: center;
    }
    .logo-green-bar {
      width: 52px;
      height: 44px;
      background: #7dc242;
      flex-shrink: 0;
    }
    .logo-text-wrap {
      margin-left: 12px;
    }
    .logo-name {
      color: white;
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 1px;
      line-height: 1;
      text-transform: uppercase;
    }
    .logo-name .logo-i {
      color: white;
      position: relative;
    }
    .logo-name .logo-i::after {
      content: '';
      position: absolute;
      top: -3px;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 4px;
      background: #e91e8c;
      border-radius: 50%;
    }
    .logo-tagline {
      color: rgba(255,255,255,0.55);
      font-size: 6.5px;
      letter-spacing: 2px;
      margin-top: 5px;
      text-transform: uppercase;
    }

    /* ── Name section ── */
    .name-section {
      position: absolute;
      top: 190px;
      left: 28px;
      right: 20px;
    }
    .name-first {
      font-size: 58px;
      font-weight: 900;
      color: white;
      line-height: 1;
      text-transform: uppercase;
      word-break: break-word;
    }
    .name-last {
      font-size: 58px;
      font-weight: 900;
      color: white;
      line-height: 1;
      text-transform: uppercase;
      word-break: break-word;
    }

    /* ── Designation / title ── */
    .designation-section {
      position: absolute;
      top: 390px;
      left: 28px;
      right: 80px;
    }
    .designation-text {
      color: #7dc242;
      font-size: 15px;
      font-weight: 400;
      line-height: 1.45;
    }

    /* ── QR code ── */
    .qr-section {
      position: absolute;
      bottom: 22px;
      right: 22px;
      text-align: center;
    }
    .qr-box {
      background: white;
      padding: 6px;
      border-radius: 6px;
      display: inline-block;
    }
    .qr-box img { display: block; width: 80px; height: 80px; }
    .conf-code {
      margin-top: 5px;
      font-size: 8px;
      color: rgba(255,255,255,0.45);
      font-family: monospace;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="badge">

    <!-- Diagonal slashes background -->
    <div class="slashes">
      <div class="slash" style="left:55%;  top:-80px;  height:900px;"></div>
      <div class="slash" style="left:65%;  top:-80px;  height:900px;"></div>
      <div class="slash" style="left:75%;  top:-80px;  height:900px;"></div>
      <div class="slash" style="left:85%;  top:-80px;  height:900px; width:80px;"></div>
      <div class="slash" style="left:40%;  top:-80px;  height:900px; opacity:0.5;"></div>
      <div class="slash" style="left:20%;  top:-80px;  height:900px; opacity:0.3;"></div>
    </div>

    <!-- Logo -->
    <div class="logo-area">
      <div class="logo-green-bar"></div>
      <div class="logo-text-wrap">
        <div class="logo-name">LA GLO<span class="logo-i">I</span>RE</div>
        <div class="logo-tagline">Our Commitment Is Your Success</div>
      </div>
    </div>

    <!-- Name -->
    <div class="name-section">
      <div class="name-first">${firstName}</div>
      <div class="name-last">${lastName}</div>
    </div>

    <!-- Designation -->
    <div class="designation-section">
      <div class="designation-text">${data.designation || data.organization || ""}</div>
    </div>

    <!-- QR code -->
    ${data.qrCodeDataUrl ? `
    <div class="qr-section">
      <div class="qr-box">
        <img src="${data.qrCodeDataUrl}" alt="QR" />
      </div>
      <div class="conf-code">${data.confirmationCode}</div>
    </div>` : ""}

  </div>
</body>
</html>`;
}
