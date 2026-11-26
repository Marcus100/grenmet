import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** The next step as a button or link of the app's own. */
  readonly action?: ReactNode;
  readonly className?: string;
  /** Say what to do next, in a sentence. */
  readonly description?: ReactNode;
  /** An icon element, for example `<Users />`. */
  readonly icon?: ReactNode;
  /** The next step as a plain link (use `action` for a button). */
  readonly link?: { readonly href: string; readonly label: string };
  /** One sentence on what is missing: "No services yet." */
  readonly title: ReactNode;
}

/**
 * An empty section says what is missing and what to do about it. Sections are
 * never hidden because they are empty.
 */
export function EmptyState({
  action,
  className,
  description,
  icon,
  link,
  title,
}: EmptyStateProps) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action || link ? (
        <EmptyContent>
          {action}
          {link ? (
            <Link
              className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4 sm:min-h-0"
              href={link.href as Route}
            >
              {link.label}
            </Link>
          ) : null}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
