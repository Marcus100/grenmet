import { EmailLayout } from "./components/layout";

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
    <EmailLayout
      eyebrow={projectName}
      footer={`The link works once and expires in ${validDays} days. If you were not expecting this, ignore this email.`}
      paragraphs={[
        `${inviterName} invited you to join ${organisationName}. Sign in with this email address, then accept the invitation.`,
      ]}
      preview={`${inviterName} invited you to join ${organisationName}`}
      primary={{ label: "Accept invitation", url: acceptLink }}
      rows={[
        { label: "Organisation", value: organisationName },
        { label: "Your role", value: roleLabel },
        { label: "Invited by", value: inviterName },
      ]}
      title={`Join ${organisationName}`}
    />
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
