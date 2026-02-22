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
      className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}
    >
      {/* Card Header */}
      <div className="px-6 py-5">
        <h3 className="font-medium text-base text-gray-800 dark:text-white/90">
          {title}
        </h3>
        {desc && (
          <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
            {desc}
          </p>
        )}
      </div>

      {/* Card Body */}
      <div className="border-gray-100 border-t p-4 sm:p-6 dark:border-gray-800">
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
};

export default ComponentCard;
