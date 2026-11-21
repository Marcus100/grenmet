import { EmailLayout } from "./components/layout";

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
    <EmailLayout
      eyebrow={projectName}
      footer="If you did not ask for a password reset, you can ignore this email. Your password will not change."
      greeting={`Hello ${username},`}
      linkFallback={resetLink}
      paragraphs={[
        "We received a request to reset your password. Use the button below to choose a new one.",
        `This link expires in ${validHours} hours.`,
      ]}
      preview={`Reset your ${projectName} password`}
      primary={{ label: "Reset password", url: resetLink }}
      title="Reset your password"
    />
  );
}

ResetPasswordEmail.PreviewProps = {
  projectName: "Grenmet",
  username: "jane@barrels.gd",
  resetLink: "https://auth.barrels.gd/reset-password?token=preview-token",
  validHours: 48,
} satisfies ResetPasswordEmailProps;

export default ResetPasswordEmail;
