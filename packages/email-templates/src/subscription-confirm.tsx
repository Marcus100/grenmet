import { EmailLayout } from "./components/layout";

/**
 * Double opt-in confirmation for a public mailing list. Brand-neutral: the
 * caller supplies the project and list names. Only the two signed links are
 * sensitive; nothing else about the subscriber is included.
 */
export interface SubscriptionConfirmEmailProps {
  confirmLink: string;
  listName: string;
  projectName: string;
  unsubscribeLink: string;
}

export function SubscriptionConfirmEmail({
  projectName,
  listName,
  confirmLink,
  unsubscribeLink,
}: SubscriptionConfirmEmailProps) {
  return (
    <EmailLayout
      eyebrow={projectName}
      footer={`You are getting this email because this address was entered for ${listName}. The link expires in 7 days.`}
      paragraphs={[
        `Someone asked to receive ${listName} at this address. Confirm to start receiving it. If it was not you, ignore this email and nothing will be sent.`,
      ]}
      preview={`Confirm your subscription to ${listName}`}
      primary={{ label: "Confirm subscription", url: confirmLink }}
      quiet="You can unsubscribe at any time."
      quietLink={{ label: "Unsubscribe", url: unsubscribeLink }}
      title={`Confirm your subscription to ${listName}`}
    />
  );
}

SubscriptionConfirmEmail.PreviewProps = {
  projectName: "Barrels Grenada",
  listName: "Grenada Signal",
  confirmLink: "https://api.example.test/api/v1/subscriptions/confirm?token=x",
  unsubscribeLink:
    "https://api.example.test/api/v1/subscriptions/unsubscribe?token=x",
} satisfies SubscriptionConfirmEmailProps;

export default SubscriptionConfirmEmail;
