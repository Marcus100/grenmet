import {
  ResponseError,
  subscriptionsGetPreferences,
} from "@barrelsgd/api-client";
import { PageHeader } from "@/components/page-header";
import { NewsletterPreferences } from "@/components/pages/newsletter-preferences";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import {
  PREFERENCES_INVALID_MESSAGE,
  PREFERENCES_UNAVAILABLE_MESSAGE,
  type SubscribedListView,
} from "@/lib/newsletter-preferences";
import { reportError } from "@/lib/report-error";
import { visitorClient } from "@/lib/visitor-client";

export const metadata = {
  title: "Manage your subscriptions",
  description: "See the GMS email lists you receive and stop any of them.",
  // A personal page reached through a token in the link; not for search.
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function NewsletterPreferencesPage({
  searchParams,
}: PageProps) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token.trim() : "";

  return (
    <>
      <PageHeader
        description="The GMS email lists sent to your address."
        title="Manage your subscriptions"
      />
      <PageSection>
        {value ? (
          <Lists token={value} />
        ) : (
          <Notice message={PREFERENCES_INVALID_MESSAGE} />
        )}
      </PageSection>
    </>
  );
}

async function Lists({ token }: { token: string }) {
  let lists: SubscribedListView[];
  try {
    const result = await subscriptionsGetPreferences({
      client: await visitorClient(),
      query: { token },
    }).unwrap();
    lists = result.lists.map((item) => ({
      listKey: item.list_key,
      listName: item.list_name,
    }));
  } catch (error) {
    if (error instanceof ResponseError && error.status === 400) {
      return <Notice message={PREFERENCES_INVALID_MESSAGE} />;
    }
    // Report the status only: the error's request URL carries the token.
    reportError(
      new Error(
        `newsletter preferences lookup failed (${error instanceof ResponseError ? error.status : "no status"})`
      ),
      "gms-newsletter-preferences"
    );
    return <Notice message={PREFERENCES_UNAVAILABLE_MESSAGE} />;
  }

  return (
    <>
      <Prose
        paragraphs={[
          "These are the lists this address is confirmed on. Stopping one leaves the others alone. You can also sign up again at any time from the newsletter page.",
        ]}
      />
      <NewsletterPreferences initialLists={lists} token={token} />
    </>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <p className="text-body-base text-gm-heading" role="status">
      {message}
    </p>
  );
}
