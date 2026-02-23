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
    width: 200,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export function generateBadgeHtml(data: BadgeData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; }
    .badge {
      width: 400px;
      height: 600px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 30px;
      position: relative;
      overflow: hidden;
    }
    .badge::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%);
    }
    .event-name {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 3px;
      opacity: 0.8;
      text-align: center;
      z-index: 1;
    }
    .attendee-info {
      text-align: center;
      z-index: 1;
    }
    .name {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .organization {
      font-size: 16px;
      opacity: 0.8;
      margin-bottom: 4px;
    }
    .designation {
      font-size: 14px;
      opacity: 0.6;
    }
    .category-badge {
      display: inline-block;
      padding: 6px 20px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 2px;
      z-index: 1;
    }
    .category-VIP { background: #e94560; }
    .category-SPEAKER { background: #533483; }
    .category-default { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); }
    .qr-section {
      text-align: center;
      z-index: 1;
    }
    .qr-code {
      background: white;
      padding: 10px;
      border-radius: 10px;
      display: inline-block;
    }
    .qr-code img { display: block; width: 120px; height: 120px; }
    .conf-code {
      margin-top: 8px;
      font-size: 11px;
      opacity: 0.6;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="badge">
    <div class="event-name">${data.eventName}</div>
    <div class="attendee-info">
      <div class="name">${data.firstName} ${data.lastName}</div>
      ${data.organization ? `<div class="organization">${data.organization}</div>` : ""}
      ${data.designation ? `<div class="designation">${data.designation}</div>` : ""}
    </div>
    <div class="category-badge category-${data.category?.toUpperCase() || "default"}">
      ${data.category || "Attendee"}
    </div>
    <div class="qr-section">
      <div class="qr-code">
        ${data.qrCodeDataUrl ? `<img src="${data.qrCodeDataUrl}" alt="QR Code" />` : ""}
      </div>
      <div class="conf-code">${data.confirmationCode}</div>
    </div>
  </div>
</body>
</html>`;
}
