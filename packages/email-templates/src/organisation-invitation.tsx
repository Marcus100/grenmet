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
 * Invitation to join an organisation. Brand-neutral: the caller supplies the
 * project, organisation and inviter names. The accept link carries a
 * single-use token, so it is the only sensitive prop.
 */
export interface OrganisationInvitationEmailProps {
  acceptLink: string;
  inviterName: string;
  organisationName: string;
  projectName: string;
  roleLabel: string;
  validDays: number;
}

export function OrganisationInvitationEmail({
  projectName,
  organisationName,
  inviterName,
  roleLabel,
  acceptLink,
  validDays,
}: OrganisationInvitationEmailProps) {
  return (
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>
        {inviterName} invited you to join {organisationName}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={container}>
          <Section style={header}>
            <Text style={eyebrow}>{projectName}</Text>
            <Text style={heading}>Join {organisationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              {inviterName} invited you to join {organisationName} as{" "}
              {roleLabel}. Sign in with this email address, then accept the
              invitation.
            </Text>

            <Section style={buttonSection}>
              <Button href={acceptLink} style={button}>
                Accept invitation
              </Button>
            </Section>

            <Hr style={divider} />

            <Text style={footer}>
              The link works once and expires in {validDays} days. If you were
              not expecting this, ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

OrganisationInvitationEmail.PreviewProps = {
  projectName: "Barrels Grenada",
  organisationName: "Example Ltd",
  inviterName: "Alex Example",
  roleLabel: "member",
  acceptLink: "https://auth.example.test/organisations/accept?token=x",
  validDays: 7,
} satisfies OrganisationInvitationEmailProps;

export default OrganisationInvitationEmail;

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
