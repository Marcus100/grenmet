import { CookieSettingsButton } from "@barrelsgd/ui/components/posthog-provider";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = { title: "Privacy and site controls" };

/*
 * REVIEW BEFORE LAUNCH: owner and lawyer to confirm every paragraph below.
 * These are short factual descriptions of what each form and feature does,
 * drawn from the code. They are not legal terms, and no retention period is
 * promised here that the service does not already keep to.
 */
export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        description="You can read the public forecast and bulletin pages without signing in. Account access, where offered, uses the shared sign-in service."
        title="Privacy and site controls"
      />
      <PageSection heading="Email alerts">
        <Prose
          paragraphs={[
            "If you sign up for weather alert emails, we keep your email address so we can send you alerts. We send alert emails only after you confirm the address. Each email includes a link to unsubscribe.",
          ]}
        />
      </PageSection>
      <PageSection heading="Browser notifications">
        <Prose
          paragraphs={[
            "If you turn on browser notifications, your browser gives us a delivery address and the keys it needs to send you a notification. We keep them to send you alerts. Turning notifications off in your browser stops them.",
          ]}
        />
      </PageSection>
      <PageSection heading="Climate newsletter by email">
        <Prose
          paragraphs={[
            "If you sign up for the daily climate newsletter, we keep your email address and the time you confirmed it, so we can prove you agreed. We send it only to confirmed addresses, once a day and only on days with news. Each email has a link that opens a page where you confirm stopping that list. Unsubscribing removes your address; we keep only a keyed fingerprint of it as proof of consent. We do not track whether you open or click the newsletter.",
          ]}
        />
      </PageSection>
      <PageSection heading="Climate data requests">
        <Prose
          paragraphs={[
            "If you ask for climate data, we keep the name, email address and organisation you give, with the details of your request. GMS staff receive the request by email, and you receive a confirmation.",
          ]}
        />
      </PageSection>
      <PageSection heading="Sign-in">
        <Prose
          paragraphs={[
            "Signing in with your Barrels account uses the shared sign-in service. This site keeps a session cookie so it knows you are signed in, and the account button shows whether you are.",
          ]}
        />
      </PageSection>
      <PageSection heading="Security checks and visitor addresses">
        <Prose
          paragraphs={[
            "To limit repeated sign-ups, this site passes your network address to our servers with each sign-up. Some forms use Cloudflare Turnstile, a check that tells people apart from automated programs.",
          ]}
        />
      </PageSection>
      <PageSection heading="Preferences saved in your browser">
        <Prose
          paragraphs={[
            "Your choice of metric or imperial units is kept in your browser's local storage. Your light or dark theme is kept in a cookie in your browser.",
          ]}
        />
      </PageSection>
      <PageSection heading="Error reports">
        <Prose
          paragraphs={[
            "If something goes wrong on the site, an error report is sent to Sentry, our error-monitoring service. A report carries the type of error, where in the code it happened and, for a signed-in user, an internal account ID. Messages, request details, cookies and breadcrumbs are removed before a report is sent. Performance traces are not sent.",
          ]}
        />
      </PageSection>
      <PageSection heading="Analytics">
        <Prose
          paragraphs={[
            "With your permission, we use PostHog, an analytics service, to count visits and page views. It runs only if you accept analytics cookies. You can change your choice at any time.",
          ]}
        />
        <p className="mt-3">
          <CookieSettingsButton className="font-semibold text-body-base text-gm-blue-ink leading-body-base underline">
            Cookie settings
          </CookieSettingsButton>
        </p>
      </PageSection>
      <PageSection heading="Sharing an update">
        <Prose
          paragraphs={[
            "The Share update button opens your browser's sharing interface where supported, or copies the update and link to your clipboard. The website does not automatically publish that content to a social account.",
          ]}
        />
      </PageSection>
      <PageSection heading="External websites">
        <Prose
          paragraphs={[
            "Links to partner services and social platforms take you to sites with their own privacy controls. Weather article illustrations may be loaded from an external image provider.",
          ]}
        />
      </PageSection>
      <PageSection heading="Questions about your information">
        <Prose
          paragraphs={[
            "Contact GMS if you have a question about information you have provided, an account, or a site feature. Describe the page and the request without sending passwords or session details.",
          ]}
        />
        <Link
          className="mt-3 inline-block font-semibold text-body-base text-gm-blue-ink leading-body-base underline"
          href="/about/contact"
        >
          Contact GMS
        </Link>
      </PageSection>
    </>
  );
}
