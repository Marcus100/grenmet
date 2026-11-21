import { EmailLayout } from "./components/layout";

/**
 * Platform notification (approvals, outcomes, reminders). Deliberately minimal:
 * a title, a one-line summary and a link into the portal. Reasons, medical
 * detail and approver comments never go in an email.
 */
export interface NotificationEmailProps {
  body: string;
  /** Replaces the default preferences sentence, for notices that bypass preferences. */
  footer?: string | null;
  linkUrl: string | null;
  projectName: string;
  title: string;
}

const DEFAULT_FOOTER =
  "You can choose which notifications you receive by email under Profile → Notifications. Details stay in the portal.";

export function NotificationEmail({
  projectName,
  title,
  body,
  footer,
  linkUrl,
}: NotificationEmailProps) {
  return (
    <EmailLayout
      eyebrow={projectName}
      footer={footer || DEFAULT_FOOTER}
      paragraphs={body ? [body] : []}
      preview={title}
      primary={
        linkUrl ? { label: "Open in the staff portal", url: linkUrl } : null
      }
      title={title}
    />
  );
}

NotificationEmail.PreviewProps = {
  projectName: "Grenmet",
  title: "Leave request waiting for your approval",
  body: "Jane Charles — Vacation, 12 Oct 2026 to 16 Oct 2026.",
  linkUrl: "https://gms.barrels.gd/hr/approvals",
} satisfies NotificationEmailProps;

export default NotificationEmail;
