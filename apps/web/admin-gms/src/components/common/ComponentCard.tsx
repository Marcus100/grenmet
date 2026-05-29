import type React from "react";

interface ComponentCardProps {
  children: React.ReactNode;
  className?: string; // Additional custom classes for styling
  desc?: string; // Description text
  title: string;
}

const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = "",
  desc = "",
}) => {
  return (
    <div
      className={`rounded-2xl border border-border bg-background ${className}`}
    >
      {/* Card Header */}
      <div className="px-6 py-5">
        <h3 className="font-medium text-base text-foreground">{title}</h3>
        {desc && <p className="mt-1 text-muted-foreground text-sm">{desc}</p>}
      </div>

      {/* Card Body */}
      <div className="border-gray-100 border-t p-4 sm:p-6">
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
};

export default ComponentCard;
