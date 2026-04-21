import { prisma } from "@/lib/prisma";

export function getFallbackAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

interface EventDomainLite {
  customDomain: string | null;
  isVerified: boolean;
}

// Resolve the public base URL for the event using a preloaded domain row.
export function eventBaseUrlFromDomain(
  domain: EventDomainLite | null | undefined
): string {
  if (domain?.customDomain && domain.isVerified) {
    return `https://${domain.customDomain}`;
  }
  return getFallbackAppUrl();
}

// Resolve the public base URL for an event by ID.
// Returns the event's verified custom domain when set, else APP_URL/NEXT_PUBLIC_APP_URL.
export async function getEventBaseUrl(eventId: string): Promise<string> {
  const domain = await prisma.eventDomain.findUnique({
    where: { eventId },
    select: { customDomain: true, isVerified: true },
  });
  return eventBaseUrlFromDomain(domain);
}
