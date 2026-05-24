import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface WelcomeEmailProps {
  email: string;
  firstName: string;
  projectName: string;
  signInLink: string;
  username: string;
}

export function WelcomeEmail({
  projectName,
  firstName,
  username,
  email,
  signInLink,
}: WelcomeEmailProps) {
  return (
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>Welcome to {projectName} — your account is ready</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>Welcome to {projectName}</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>Hi {firstName},</Text>
            <Text style={paragraph}>
              Your account has been created. Here are your details:
            </Text>

            <Section style={detailsBox}>
              <Text style={detailRow}>
                <span style={detailLabel}>Username</span>
                <span style={detailValue}>{username}</span>
              </Text>
              <Text style={detailRow}>
                <span style={detailLabel}>Email</span>
                <span style={detailValue}>{email}</span>
              </Text>
            </Section>

            <Section style={buttonSection}>
              <Button href={signInLink} style={button}>
                Sign in to your account
              </Button>
            </Section>

            <Text style={footer}>
              If you didn't create this account, please contact us immediately.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

WelcomeEmail.PreviewProps = {
  projectName: "Grenmet",
  firstName: "Jane",
  username: "janesmith",
  email: "jane@barrels.gd",
  signInLink: "https://auth.barrels.gd",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;

// ─── Styles ──────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: "#fafbfc",
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
  backgroundColor: "#009688",
  padding: "32px 40px",
  textAlign: "center",
};

const heading: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: "700",
  lineHeight: "1.4",
  margin: 0,
};

const content: React.CSSProperties = {
  padding: "28px 40px 32px",
};

const paragraph: React.CSSProperties = {
  color: "#555555",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "12px 0",
};

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f5f5f5",
  borderRadius: "6px",
  margin: "20px 0",
  padding: "16px 20px",
};

const detailRow: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.8",
  margin: "4px 0",
};

const detailLabel: React.CSSProperties = {
  color: "#888888",
  display: "inline-block",
  minWidth: "80px",
};

const detailValue: React.CSSProperties = {
  color: "#333333",
  fontWeight: "600",
};

const buttonSection: React.CSSProperties = {
  textAlign: "center",
  margin: "28px 0",
};

const button: React.CSSProperties = {
  backgroundColor: "#009688",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  padding: "12px 28px",
  textDecoration: "none",
};

const footer: React.CSSProperties = {
  color: "#888888",
  fontSize: "14px",
  lineHeight: "1.5",
  marginTop: "24px",
};
