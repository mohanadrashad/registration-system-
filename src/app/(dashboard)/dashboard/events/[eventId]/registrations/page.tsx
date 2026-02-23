import { redirect } from "next/navigation";

export default async function RegistrationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/dashboard/events/${eventId}/attendees`);
}
