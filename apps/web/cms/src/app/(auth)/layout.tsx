import { PublicEnvScript } from "@barrelsgd/ui/components/public-env-script";
import type { ReactNode } from "react";
import "../globals.css";

// Signed-out pages only (sign-in and the 404 below the Payload editor's own
// root layout). The editor keeps Payload's styles.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <PublicEnvScript />
        {children}
      </body>
    </html>
  );
}
