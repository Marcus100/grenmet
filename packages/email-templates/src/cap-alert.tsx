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
 * A published CAP weather alert sent to confirmed subscribers of the alert
 * list. Carries only public alert content plus the recipient's own signed
 * unsubscribe link. CAP remains the source: the email links to the alert page
 * and to the CAP XML.
 */
export interface CapAlertEmailProps {
  alertLink: string;
  areas: string;
  capLink: string;
  certainty: string;
  effective?: string | null;
  event: string;
  expires?: string | null;
  headline: string;
  instruction?: string | null;
  label: string;
  listName: string;
  projectName: string;
  severity: string;
  unsubscribeLink: string;
  urgency: string;
}

export function CapAlertEmail({
  projectName,
  listName,
  label,
  headline,
  event,
  severity,
  urgency,
  certainty,
  areas,
  effective,
  expires,
  instruction,
  alertLink,
  capLink,
  unsubscribeLink,
}: CapAlertEmailProps) {
  return (
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>{headline}</Preview>
      <Body style={bodyStyle}>
        <Container style={container}>
          <Section style={header}>
            <Text style={eyebrow}>
              {projectName} · {label}
            </Text>
            <Text style={heading}>{headline}</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              <strong>{event}</strong>
              {areas ? ` for ${areas}` : ""}.
            </Text>
            <Text style={detail}>
              Severity: {severity}. Urgency: {urgency}. Certainty: {certainty}.
            </Text>
            {effective ? (
              <Text style={detail}>Effective: {effective}</Text>
            ) : null}
            {expires ? <Text style={detail}>Expires: {expires}</Text> : null}
            {instruction ? (
              <Text style={paragraph}>
                <strong>What to do:</strong> {instruction}
              </Text>
            ) : null}

            <Section style={buttonSection}>
              <Button href={alertLink} style={button}>
                Read the full alert
              </Button>
            </Section>

            <Text style={detail}>
              Machine-readable CAP message: <Link href={capLink}>CAP XML</Link>
            </Text>

            <Hr style={divider} />

            <Text style={footer}>
              You receive this because you subscribed to {listName}. Do not rely
              on email alone in an emergency. Unsubscribe any time:{" "}
              <Link href={unsubscribeLink}>unsubscribe</Link>.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

CapAlertEmail.PreviewProps = {
  projectName: "Barrels Grenada",
  listName: "GMS weather alerts",
  label: "Weather alert",
  headline: "Flash flood warning for Grenada",
  event: "Flash flood warning",
  severity: "Severe",
  urgency: "Expected",
  certainty: "Likely",
  areas: "Grenada, Carriacou",
  effective: "18 Oct 2026, 14:30 AST",
  expires: "18 Oct 2026, 20:00 AST",
  instruction: "Avoid low-lying roads and river crossings.",
  alertLink: "https://weather.example.test/alerts/x",
  capLink: "https://api.example.test/api/cap/x.xml",
  unsubscribeLink:
    "https://api.example.test/api/v1/subscriptions/unsubscribe?token=x",
} satisfies CapAlertEmailProps;

export default CapAlertEmail;

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
  fontSize: "22px",
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

const detail: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "4px 0",
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
