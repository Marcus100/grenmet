import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { ReactNode } from "react";
import { EmptyState, type EmptyStateProps } from "./empty-state";

export interface PageSectionProps {
  /** Buttons or links for the section (top right). */
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly description?: ReactNode;
  /**
   * What the section says when it has nothing. Used when `isEmpty` is true, in
   * place of the children; the section itself still shows.
   */
  readonly empty?: EmptyStateProps;
  readonly isEmpty?: boolean;
  /** Heading level under the page's `h1`. Default 2. */
  readonly level?: 2 | 3;
  readonly title: ReactNode;
}

/** A titled card section with an optional description, actions and an empty state. */
export function PageSection({
  actions,
  children,
  className,
  description,
  empty,
  isEmpty = false,
  level = 2,
  title,
}: PageSectionProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle>
          <Heading className="text-base leading-snug font-medium">
            {title}
          </Heading>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {actions ? (
          <CardAction className="flex flex-wrap items-center gap-2">
            {actions}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {isEmpty && empty ? <EmptyState {...empty} /> : children}
      </CardContent>
    </Card>
  );
}
