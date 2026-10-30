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
        <p className="text-caption text-events-hibiscus-deep font-medium">
          Welcome, {viewer.name.split(" ")[0]}
        </p>
        <h1 className="font-display text-heading-base sm:text-heading-md mt-1 font-bold tracking-tight">
          Make it yours
        </h1>
        <p className="text-body-base text-muted-foreground mt-2">
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
