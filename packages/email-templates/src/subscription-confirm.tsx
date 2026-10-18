import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

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
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>Confirm your subscription to {listName}</Preview>
      <Body style={bodyStyle}>
        <Container style={container}>
          <Section style={header}>
            <Text style={eyebrow}>{projectName}</Text>
            <Text style={heading}>Confirm your subscription to {listName}</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              Someone asked to receive {listName} at this address. Confirm to
              start receiving it. If it was not you, ignore this email and
              nothing will be sent.
            </Text>

            <Section style={buttonSection}>
              <Button href={confirmLink} style={button}>
                Confirm subscription
              </Button>
            </Section>

            <Hr style={divider} />

            <Text style={footer}>
              The link expires in 7 days. You can unsubscribe at any time:{" "}
              <Link href={unsubscribeLink}>unsubscribe</Link>.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
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
