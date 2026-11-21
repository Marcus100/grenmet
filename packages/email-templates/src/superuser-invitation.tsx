import { EmailLayout } from "./components/layout";

/**
 * Invitation to become a Barrels superuser (ADR-0059 rule 1). Brand-neutral: the
 * caller supplies the project and inviter names. The accept link carries a
 * single-use token, so it is the only sensitive prop. The reason is never mailed:
 * it is written to the audit log only.
 */
export interface SuperuserInvitationEmailProps {
  acceptLink: string;
  inviterName: string;
  projectName: string;
  validHours: number;
}

export function SuperuserInvitationEmail({
  projectName,
  inviterName,
  acceptLink,
  validHours,
}: SuperuserInvitationEmailProps) {
  return (
    <EmailLayout
      eyebrow={projectName}
      footer={`The link works once and expires in ${validHours} hours. If you were not expecting this, ignore this email.`}
      paragraphs={[
        `${inviterName} invited you to be an administrator of ${projectName}.`,
        "Open the link, then enter the six-digit code we email to this address. You will set up an authenticator app next.",
      ]}
      preview={`${inviterName} invited you to be an administrator`}
      primary={{ label: "Open invitation", url: acceptLink }}
      title="Accept your administrator invitation"
    />
  );
}

SuperuserInvitationEmail.PreviewProps = {
  projectName: "Barrels Grenada",
  inviterName: "Alex Example",
  acceptLink: "https://auth.example.test/superuser-invite?token=x",
  validHours: 24,
} satisfies SuperuserInvitationEmailProps;

export default SuperuserInvitationEmail;
