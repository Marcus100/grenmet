import { Button } from "@grenmet/ui/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center space-y-2 text-center">
      <h1 className="font-semibold text-2xl">Page not found.</h1>
      <p className="text-muted-foreground">
        The page you are looking for could not be found.
      </p>
      <Button
        nativeButton={false}
        render={<Link href="/" prefetch={false} replace />}
        variant="outline"
      >
        Go back home
      </Button>
    </div>
  );
}
