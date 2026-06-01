import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import dns from "dns";
import { promisify } from "util";

const resolveTxt = promisify(dns.resolveTxt);

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// POST - Verify custom domain
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor", module: "customDomain" });
    if (ctx instanceof NextResponse) return ctx;

    // Get domain settings
    const domain = await prisma.eventDomain.findUnique({
      where: { eventId },
    });

    if (!domain) {
      return NextResponse.json(
        { error: "Domain not configured" },
        { status: 400 }
      );
    }

    if (!domain.customDomain) {
      return NextResponse.json(
        { error: "No custom domain set" },
        { status: 400 }
      );
    }

    if (domain.isVerified) {
      return NextResponse.json({
        verified: true,
        message: "Domain already verified",
      });
    }

    try {
      // Check TXT records for verification
      const txtRecords = await resolveTxt(domain.customDomain);
      const flatRecords = txtRecords.flat();

      const isVerified = flatRecords.some(
        (record) => record === domain.verificationRecord
      );

      if (isVerified) {
        // Update domain as verified
        await prisma.eventDomain.update({
          where: { eventId },
          data: {
            isVerified: true,
            verifiedAt: new Date(),
          },
        });

        return NextResponse.json({
          verified: true,
          message: "Domain verified successfully",
        });
      } else {
        return NextResponse.json({
          verified: false,
          message: "Verification record not found. Please add the TXT record and try again.",
          expected: domain.verificationRecord,
          found: flatRecords,
        });
      }
    } catch (dnsError) {
      // DNS lookup failed
      console.error("DNS lookup error:", dnsError);
      return NextResponse.json({
        verified: false,
        message: "Could not lookup DNS records. Please check the domain name.",
        error: dnsError instanceof Error ? dnsError.message : "DNS lookup failed",
      });
    }
  } catch (error) {
    console.error("Error verifying domain:", error);
    return NextResponse.json(
      { error: "Failed to verify domain" },
      { status: 500 }
    );
  }
}
