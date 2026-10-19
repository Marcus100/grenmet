import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import {
  AlertEmailSignup,
  AlertSignupResult,
} from "@/components/pages/alert-email-signup";
import { BrowserNotifications } from "@/components/pages/browser-notifications";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Get alerts",
  description:
    "How to receive weather warnings from the Grenada Meteorological Service.",
};

export default function SubscribePage() {
  return (
    <>
      <PageHeader
        description="How to receive warnings, and which channel to rely on."
        title="Get alerts"
      />
      <Suspense fallback={null}>
        <AlertSignupResult />
      </Suspense>
      <PageSection heading="Get alerts by email">
        <Prose
          paragraphs={[
            "We email you when a weather alert is published, updated or cancelled. You confirm your address first, and every email has an unsubscribe link.",
          ]}
        />
        <div className="mt-4">
          <AlertEmailSignup />
        </div>
      </PageSection>
      <PageSection heading="Get browser notifications">
        <Prose
          paragraphs={[
            "Allow notifications and this browser shows a message when an alert is published. Nothing is asked until you press the button, and you can turn it off here at any time. Notifications need a connection and, on some phones, the browser to be allowed to run in the background.",
          ]}
        />
        <div className="mt-4">
          <BrowserNotifications />
        </div>
      </PageSection>
      <PageSection heading="Channels">
        <InfoTable
          headers={["Channel", "Best for", "Works without power?"]}
          rows={[
            ["This website", "Full detail and the current picture", "No"],
            ["Email alerts", "A message in the inbox you already check", "No"],
            [
              "Browser notifications",
              "A pop-up on the device where you allowed them",
              "No",
            ],
            ["Social media", "Reach and sharing", "No"],
            [
              "Radio",
              "Reaching everyone during an outage",
              "Yes, with a battery radio",
            ],
            ["CAP feed", "Broadcasters, agencies and app developers", "No"],
          ]}
        />
      </PageSection>
      <PageSection heading="Do not rely on one channel">
        <Prose
          paragraphs={[
            "Every digital channel depends on power and on the mobile network — the two things a severe event takes out first. A battery or wind-up radio is the one channel that keeps working when the rest fail, and every household should have one.",
            "Treat phone alerts as the fast channel and radio as the reliable one. Neither replaces the other.",
            "The Common Alerting Protocol (CAP) feed remains the authoritative source: email and browser notifications are copies of it. We do not offer WhatsApp or SMS alerts.",
          ]}
        />
      </PageSection>
      <PageSection heading="For developers">
        <Prose
          paragraphs={[
            "Warnings are published in the Common Alerting Protocol, a structured international standard designed for machine consumption. Any app, broadcaster or agency system can consume the feed directly rather than scraping this website.",
            "Exercise and test messages are flagged in the feed, so a well-built consumer can suppress or label them automatically.",
          ]}
        />
      </PageSection>
    </>
  );
}
