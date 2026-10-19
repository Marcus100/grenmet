import { PageIntro } from "@/components/editorial";

// OWNER REVIEW NEEDED: factual draft of what the site and API do today. The
// owner must confirm the wording, the contact route and the retention periods
// before this is treated as the official notice.
export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <PageIntro eyebrow="Privacy" title="What we collect and why">
        <p>
          Reading Grenada Signal is free and needs no account. This page
          explains what is collected if you use the newsletter signup or send
          page feedback.
        </p>
      </PageIntro>
      <div className="space-y-6 text-lg leading-relaxed">
        <h2 className="font-semibold font-serif text-3xl">Newsletter</h2>
        <p>
          When you subscribe we store your email address and the time of each
          step. We email you once to confirm the address; you are subscribed
          only after you click the link in that email. Every newsletter has an
          unsubscribe link.
        </p>
        <h2 className="font-semibold font-serif text-3xl">Page feedback</h2>
        <p>
          If you answer &ldquo;Was this page helpful?&rdquo; we store your
          answer, the page and any comment you type, with no name or email.
          Please do not put personal details in the comment.
        </p>
        <h2 className="font-semibold font-serif text-3xl">Spam protection</h2>
        <p>
          Forms are protected by Cloudflare Turnstile. Your browser contacts
          Cloudflare, which checks the request comes from a person and tells our
          server the result. Cloudflare processes that data under its own
          privacy policy.
        </p>
        <h2 className="font-semibold font-serif text-3xl">
          How long we keep it
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>A subscription you never confirm is deleted after 30 days.</li>
          <li>
            If you unsubscribe, we delete your address and keep only a one-way
            code of it, so we can honour your choice and never email you again
            by mistake.
          </li>
          <li>Page feedback comments are deleted after 24 months.</li>
        </ul>
        <h2 className="font-semibold font-serif text-3xl">
          Questions or requests
        </h2>
        <p>
          To see, correct or delete your information, send a request through the
          contact page on the Barrels Grenada website at barrels.gd. Say which
          address you subscribed with and do not include passwords.
        </p>
      </div>
    </article>
  );
}
