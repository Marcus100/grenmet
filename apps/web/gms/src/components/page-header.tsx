interface PageHeaderProps {
  description?: string;
  title: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mx-4 mb-4">
      <div className="mx-auto max-w-7xl lg:px-8 lg:py-6">
        <h1 className="font-bold text-3xl text-gm-navy sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 text-muted-foreground text-sm">{description}</p>
        )}
      </div>
    </div>
  );
}
