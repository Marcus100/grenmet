import type { Metadata } from "next";
import { OnboardingForm } from "@/components/community/onboarding-form";
import { requireViewer } from "@/data/viewer";

export const metadata: Metadata = {
  title: "Welcome",
  robots: { index: false },
};

export default async function WelcomePage() {
  const viewer = await requireViewer("/welcome");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="font-medium text-caption text-events-hibiscus-deep">
          Welcome, {viewer.name.split(" ")[0]}
        </p>
        <h1 className="mt-1 font-bold font-display text-heading-base tracking-tight sm:text-heading-md">
          Make it yours
        </h1>
        <p className="mt-2 text-body-base text-muted-foreground">
          Three quick questions so we can show you the right fetes, meetups and
          people.
        </p>
      </div>
      <OnboardingForm
        initialIntents={viewer.intents}
        initialInterests={viewer.interests}
        initialParish={viewer.parish}
      />
    </div>
  );
}
