interface PageHeaderProps {
  description?: string;
  title: string;
}

/**
 * Page title block. It sits under the breadcrumb trail (pages layout), so its
 * top padding is small. Deliberately carries no container of its own — it sits
 * inside the route group's container so the title's left edge lines up with
 * the content beneath it at every breakpoint.
 */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-6 pt-3 lg:pt-4">
      <h1 className="text-balance font-bold text-gm-navy text-heading-md leading-heading-md">
        {title}
      </h1>
      {description && (
        <p className="mt-1 max-w-prose text-pretty text-body-base text-gm-text-secondary leading-body-base">
          {description}
        </p>
      )}
    </div>
  );
}
