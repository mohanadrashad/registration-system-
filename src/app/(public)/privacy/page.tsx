import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Statement · La Gloire",
  description:
    "How La Gloire's event registration platform collects and uses personal information.",
};

const LAST_UPDATED = "29 September 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Privacy Statement</h1>
        <p className="text-sm text-muted-foreground">
          La Gloire event registration platform · Last updated {LAST_UPDATED}
        </p>
      </header>

      <Section title="Who we are">
        <p>
          This website is operated by La Gloire, an events and hospitality
          company based in Riyadh, Saudi Arabia. We use it to take
          registrations for events we organize and to manage those events.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <strong className="text-foreground">Attendees.</strong> When you
          register for an event we collect your full name, email address, phone
          number, and any other details that event&apos;s registration form
          asks for, such as organization, job title, nationality or city. Some
          events also ask you to upload a document, such as an ID copy or a
          travel receipt, or to add details after registering (for example
          travel information) through the attendee portal.
        </p>
        <p>
          <strong className="text-foreground">Staff.</strong> Our staff sign in
          with a work email address and password to manage events. Passwords
          are stored only in hashed form.
        </p>
        <p>
          <strong className="text-foreground">Cookies.</strong> We use only the
          cookies the site needs to work: a staff sign-in session, a temporary
          sign-in for the attendee portal, and a cookie that keeps files you
          upload linked to your registration before you submit it. We do not
          use advertising or tracking cookies.
        </p>
        <p>This website never asks for bank or credit card details.</p>
      </Section>

      <Section title="How we use it">
        <p>
          We use your information to register you for the event, send your
          confirmation and event updates, issue your event badge, check you in
          at the venue, and organize the event details you provide.
        </p>
      </Section>

      <Section title="Who can see it">
        <p>
          Your registration is visible only to the staff managing the event you
          registered for. Files you upload are stored privately and can only be
          opened by signed-in staff. We use service providers to run the
          website (hosting, database, file storage and message delivery), who
          process the information only on our behalf.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep registration information for as long as needed to organize
          the event and to meet our business and legal obligations.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          To ask what information we hold about you, correct it, or ask us to
          delete it, reply to the confirmation email you received when you
          registered, or contact the La Gloire team that invited you to the
          event.
        </p>
      </Section>
    </main>
  );
}
