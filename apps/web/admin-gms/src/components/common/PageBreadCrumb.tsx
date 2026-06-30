import Link from "next/link";
import type React from "react";

interface BreadcrumbProps {
  pageTitle: string;
}

const PageBreadcrumb: React.FC<BreadcrumbProps> = ({ pageTitle }) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
    <h2 className="font-semibold text-foreground text-xl" x-text="pageName">
      {pageTitle}
    </h2>
    <nav>
      <ol className="flex items-center gap-1.5">
        <li>
          <Link
            className="inline-flex items-center gap-1.5 text-muted-foreground text-sm"
            href="/"
          >
            Home
            <svg
              aria-hidden="true"
              className="stroke-current"
              fill="none"
              height="16"
              viewBox="0 0 17 16"
              width="17"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                stroke=""
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.2"
              />
            </svg>
          </Link>
        </li>
        <li className="text-foreground text-sm">{pageTitle}</li>
      </ol>
    </nav>
  </div>
);

export default PageBreadcrumb;
