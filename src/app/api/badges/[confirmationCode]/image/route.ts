import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { generateQRCode } from "@/lib/badge-generator";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";

export const runtime = "nodejs";

function toTitleCase(str: string): string {
  // Only capitalize first letter of each word — don't lowercase the rest
  // so acronyms like CEO, CTO stay intact
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Render at 3× for high quality on mobile (phones are typically 3× density)
const S = 3;
const W = 360 * S; // 1080
const H = 560 * S; // 1680

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ confirmationCode: string }> }
) {
  const { confirmationCode } = await params;

  const registration = await prisma.registration.findUnique({
    where: { confirmationCode },
    include: { contact: true, event: true },
  });

  if (!registration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const qrCodeDataUrl = await generateQRCode(`${appUrl}/badge/${confirmationCode}`);

  const fontLight = readFileSync(join(process.cwd(), "public/fonts/Montserrat-Light.otf"));
  const fontSemiBold = readFileSync(join(process.cwd(), "public/fonts/Montserrat-SemiBold.otf"));

  const bgBuffer = readFileSync(join(process.cwd(), "public/badge-bg.jpg"));
  const bgSrc = `data:image/jpeg;base64,${bgBuffer.toString("base64")}`;

  const logoBuffer = readFileSync(join(process.cwd(), "public/logo-white.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const firstName = registration.contact.firstName.toUpperCase();
  const lastName = registration.contact.lastName.toUpperCase();
  const designation = toTitleCase(
    registration.contact.designation || registration.contact.organization || ""
  );

  return new ImageResponse(
    React.createElement(
      "div",
      { style: { width: W, height: H, position: "relative", display: "flex" } },

      // Background
      React.createElement("img", {
        src: bgSrc,
        style: { position: "absolute", top: 0, left: 0, width: W, height: H },
      }),

      // Logo
      React.createElement("img", {
        src: logoSrc,
        style: { position: "absolute", top: 47 * S, left: 0, width: 240 * S },
      }),

      // Name block (first + last in one column, padding 10×S)
      React.createElement(
        "div",
        {
          style: {
            position: "absolute",
            top: 185 * S,
            left: 28 * S,
            width: 314 * S,
            display: "flex",
            flexDirection: "column",
            padding: 10 * S,
          },
        },
        React.createElement(
          "span",
          {
            style: {
              fontFamily: "Montserrat",
              fontWeight: 600,
              fontSize: 40 * S,
              color: "white",
              lineHeight: 1.05,
            },
          },
          firstName
        ),
        React.createElement(
          "span",
          {
            style: {
              fontFamily: "Montserrat",
              fontWeight: 600,
              fontSize: 40 * S,
              color: "white",
              lineHeight: 1.05,
            },
          },
          lastName
        )
      ),

      // Designation (top = 472-135 = 337, padding 10×S)
      React.createElement(
        "div",
        {
          style: {
            position: "absolute",
            top: 337 * S,
            left: 28 * S,
            width: 312 * S,
            padding: 10 * S,
            fontFamily: "Montserrat",
            fontWeight: 300,
            fontSize: 18 * S,
            color: "#7dc242",
            lineHeight: 1.5,
          },
        },
        designation
      ),

      // QR code
      React.createElement(
        "div",
        {
          style: {
            position: "absolute",
            bottom: 20 * S,
            right: 20 * S,
            background: "white",
            padding: 5 * S,
            borderRadius: 5 * S,
            display: "flex",
          },
        },
        React.createElement("img", {
          src: qrCodeDataUrl,
          style: { width: 76 * S, height: 76 * S },
        })
      )
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Montserrat", data: fontLight, weight: 300, style: "normal" },
        { name: "Montserrat", data: fontSemiBold, weight: 600, style: "normal" },
      ],
    }
  );
}
