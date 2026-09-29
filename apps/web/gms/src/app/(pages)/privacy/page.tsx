import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = { title: "Privacy and site controls" };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        description="You can read the public forecast and bulletin pages without signing in. Account access, where offered, uses the shared sign-in service."
        title="Privacy and site controls"
      />
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
