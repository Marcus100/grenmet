import { PublicEnvScript } from "@barrelsgd/ui/components/public-env-script";
import type { ReactNode } from "react";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PublicEnvScript />
        {children}
      </body>
    </html>
  );
}
