interface PageHeaderProps {
  description?: string;
  title: string;
}

/**
 * Page title block. Deliberately carries no container of its own — it sits
 * inside the route group's container so the title's left edge lines up with
 * the content beneath it at every breakpoint.
 */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-6 pt-6 lg:pt-8">
      <h1 className="font-bold text-gm-navy text-heading-md leading-heading-md">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-body-base text-gm-text-secondary leading-body-base">
          {description}
        </p>
      )}
    </div>
  );
}
