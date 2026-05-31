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
} from "@react-email/components";

export interface ResetPasswordEmailProps {
  projectName: string;
  resetLink: string;
  username: string;
  validHours: number;
}

export function ResetPasswordEmail({
  projectName,
  username,
  resetLink,
  validHours,
}: ResetPasswordEmailProps) {
  return (
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>Reset your {projectName} password</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{projectName} — Password Recovery</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>Hello {username},</Text>
            <Text style={paragraph}>
              We received a request to reset your password. Click the button
              below to choose a new one:
            </Text>

            <Section style={buttonSection}>
              <Button href={resetLink} style={button}>
                Reset password
              </Button>
            </Section>

            <Text style={paragraph}>
              Or copy and paste this link into your browser:
            </Text>
            <Text style={linkText}>
              <Link href={resetLink} style={linkStyle}>
                {resetLink}
              </Link>
            </Text>

            <Text style={paragraph}>
              This link expires in <strong>{validHours} hours</strong>.
            </Text>

            <Hr style={divider} />

            <Text style={footer}>
              If you didn't request a password reset, you can safely ignore this
              email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

ResetPasswordEmail.PreviewProps = {
  projectName: "Grenmet",
  username: "jane@barrels.gd",
  resetLink: "https://auth.barrels.gd/reset-password?token=preview-token",
  validHours: 48,
} satisfies ResetPasswordEmailProps;

export default ResetPasswordEmail;

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
  backgroundColor: "#ffffff",
  padding: "32px 40px 0",
  textAlign: "center",
};

const heading: React.CSSProperties = {
  color: "#333333",
  fontSize: "20px",
  fontWeight: "600",
  lineHeight: "1.4",
  margin: 0,
};

const content: React.CSSProperties = {
  padding: "24px 40px 32px",
};

const paragraph: React.CSSProperties = {
  color: "#555555",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "12px 0",
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

const linkText: React.CSSProperties = {
  margin: "8px 0 20px",
  wordBreak: "break-all",
};

const linkStyle: React.CSSProperties = {
  color: "#009688",
  fontSize: "14px",
};

const divider: React.CSSProperties = {
  borderColor: "#cccccc",
  margin: "24px 0",
};

const footer: React.CSSProperties = {
  color: "#888888",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: 0,
};
