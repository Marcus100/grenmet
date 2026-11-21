import { EmailLayout } from "./components/layout";

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
    <EmailLayout
      eyebrow={projectName}
      footer="If you did not create this account, please contact us right away."
      greeting={`Hi ${firstName},`}
      paragraphs={["Your account has been created. Here are your details."]}
      preview={`Welcome to ${projectName}: your account is ready`}
      primary={{ label: "Sign in to your account", url: signInLink }}
      rows={[
        { label: "Username", value: username },
        { label: "Email", value: email },
      ]}
      title={`Welcome to ${projectName}`}
    />
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
