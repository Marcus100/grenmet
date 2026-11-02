import type { Metadata } from "next";
import { SectionHero } from "@/components/section-hero";

// OWNER REVIEW NEEDED: factual draft of what the site and API do today. GAA
// (the client) and the owner must confirm wording, the contact address and the
// retention periods before this is treated as the official notice.
export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What the Maurice Bishop International Airport website collects through its contact form, how long it is kept, and how to ask about it.",
};

export default function PrivacyPage() {
  return (
    <>
      <SectionHero
        dek="What this website collects, how long we keep it, and how to ask about it."
        eyebrow="Grenada Airports Authority"
        title="Privacy"
      />
      <div className="text-gaa-muted mx-auto max-w-3xl space-y-8 px-4 py-14 leading-relaxed lg:px-8">
        <section>
          <h2 className="font-display text-gaa-navy text-xl font-semibold">
            Reading the site
          </h2>
          <p className="mt-2">
            You can read this site without an account. Optional analytics runs
            only if you accept it, and you can change that choice later.
          </p>
        </section>
        <section>
          <h2 className="font-display text-gaa-navy text-xl font-semibold">
            Contact form
          </h2>
          <p className="mt-2">
            When you send a message we store your name, email address, subject
            and message, and email them to the Grenada Airports Authority so
            staff can reply. We use them only to answer you.
          </p>
        </section>
        <section>
          <h2 className="font-display text-gaa-navy text-xl font-semibold">
            Page feedback
          </h2>
          <p className="mt-2">
            If you answer &ldquo;Was this page helpful?&rdquo; we store your
            answer, the page and any comment you type. It is not linked to your
            name or email. Please do not put personal details in the comment.
          </p>
        </section>
        <section>
          <h2 className="font-display text-gaa-navy text-xl font-semibold">
            Spam protection
          </h2>
          <p className="mt-2">
            Forms are protected by Cloudflare Turnstile. When you use a form,
            your browser talks to Cloudflare, which checks that the request
            comes from a person and shares the result with our server.
            Cloudflare processes that data under its own privacy policy.
          </p>
        </section>
        <section>
          <h2 className="font-display text-gaa-navy text-xl font-semibold">
            How long we keep it
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Contact messages are deleted 24 months after they are received.
            </li>
            <li>Page feedback comments are deleted after 24 months.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-display text-gaa-navy text-xl font-semibold">
            Questions or requests
          </h2>
          <p className="mt-2">
            To see, correct or delete what you sent us, email{" "}
            <a className="underline" href="mailto:gaa@gaa.gd">
              gaa@gaa.gd
            </a>{" "}
            and describe the message. Do not include passwords.
          </p>
        </section>
      </div>
    </>
  );
}
