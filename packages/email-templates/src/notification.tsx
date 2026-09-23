import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

/**
 * Platform notification (approvals, outcomes, reminders). Deliberately minimal:
 * a title, a one-line summary and a link into the portal. Reasons, medical
 * detail and approver comments never go in an email.
 */
export interface NotificationEmailProps {
  body: string;
  linkUrl: string | null;
  projectName: string;
  title: string;
}

export function NotificationEmail({
  projectName,
  title,
  body,
  linkUrl,
}: NotificationEmailProps) {
  return (
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>{title}</Preview>
      <Body style={bodyStyle}>
        <Container style={container}>
          <Section style={header}>
            <Text style={eyebrow}>{projectName}</Text>
            <Text style={heading}>{title}</Text>
          </Section>

          <Section style={content}>
            {body ? <Text style={paragraph}>{body}</Text> : null}

            {linkUrl ? (
              <Section style={buttonSection}>
                <Button href={linkUrl} style={button}>
                  Open in the staff portal
                </Button>
              </Section>
            ) : null}

            <Hr style={divider} />

            <Text style={footer}>
              You can choose which notifications you receive by email under
              Profile → Notifications. Details stay in the portal.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

NotificationEmail.PreviewProps = {
  projectName: "Grenmet",
  title: "Leave request waiting for your approval",
  body: "Jane Charles — Vacation, 12 Oct 2026 to 16 Oct 2026.",
  linkUrl: "https://admin.barrels.gd/hr/approvals",
} satisfies NotificationEmailProps;

export default NotificationEmail;

// ─── Styles ──────────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f3f8fc",
  fontFamily: "Arial, Helvetica, sans-serif",
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  maxWidth: "600px",
  borderRadius: "8px",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  backgroundColor: "#ffffff",
  padding: "32px 40px 0",
};

const eyebrow: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  letterSpacing: "0.04em",
  margin: "0 0 8px",
  textTransform: "uppercase",
};

const heading: React.CSSProperties = {
  color: "#0b132b",
  fontSize: "20px",
  fontWeight: "600",
  lineHeight: "1.4",
  margin: 0,
};

const content: React.CSSProperties = {
  padding: "16px 40px 32px",
};

const paragraph: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "12px 0",
};

const buttonSection: React.CSSProperties = {
  margin: "24px 0",
};

const button: React.CSSProperties = {
  backgroundColor: "#0b63ee",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  padding: "12px 28px",
  textDecoration: "none",
};

const divider: React.CSSProperties = {
  borderColor: "#d0d5dd",
  margin: "24px 0",
};

const footer: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: 0,
};
