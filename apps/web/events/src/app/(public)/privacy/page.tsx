import type { Metadata } from "next";

// OWNER REVIEW NEEDED: factual draft of what the site and API do today. The
// owner must confirm the wording, the contact route and any retention period
// for account and event data (none is automated yet) before this is official.
export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Barrels Events collects, how long it is kept, and how to ask about it.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-bold font-display text-heading-base tracking-tight sm:text-heading-md">
        Privacy
      </h1>
      <p className="text-body-base text-muted-foreground">
        You can browse the calendar without signing in. This page explains what
        is collected when you do more.
      </p>
      <section className="space-y-2">
        <h2 className="font-semibold text-body-base">Signing in</h2>
        <p className="text-body-base text-muted-foreground">
          Sign-in uses the shared Barrels sign-in service. We store your name
          and email address and the details you choose to add to your profile,
          such as parish and interests. Sign-in codes are sent to your email.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-body-base">
          Events, RSVPs and messages
        </h2>
        <p className="text-body-base text-muted-foreground">
          We store the RSVPs you make, groups you join, events you suggest and
          messages you send through the site, so organisers and other members
          can see what you chose to share with them.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-body-base">Spam protection</h2>
        <p className="text-body-base text-muted-foreground">
          Forms that send email or store your details are protected by
          Cloudflare Turnstile. Your browser contacts Cloudflare, which checks
          the request comes from a person and tells our server the result.
          Cloudflare processes that data under its own privacy policy.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-body-base">How long we keep it</h2>
        <p className="text-body-base text-muted-foreground">
          Account, RSVP and message data is kept while your account exists.
          Across Barrels Grenada sites, email signups that are never confirmed
          are deleted after 30 days, unsubscribed addresses are kept only as a
          one-way code, and page-feedback comments are deleted after 24 months.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-body-base">Questions or requests</h2>
        <p className="text-body-base text-muted-foreground">
          To see, correct or delete your information, send a request through the
          contact page on the Barrels Grenada website at barrels.gd. Say which
          email address you use here and do not include passwords.
        </p>
      </section>
    </div>
  );
}
