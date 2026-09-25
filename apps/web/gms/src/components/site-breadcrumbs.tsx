"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@barrelsgd/ui/components/ui/breadcrumb";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { breadcrumbTrail } from "@/lib/breadcrumbs";

/**
 * Section › Group › Page trail above every standing content page, derived from
 * NAV_SECTIONS (see `breadcrumbTrail`), so it always follows the navigation.
 * The wrapper keeps its top spacing when a page has no trail.
 */
export function SiteBreadcrumbs() {
  const trail = breadcrumbTrail(usePathname());

  return (
    <div className="pt-4 lg:pt-6">
      {trail.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList className="text-body-sm text-gm-text-secondary leading-body-sm">
            {trail.map((crumb, index) => (
              <Fragment key={`${crumb.href}-${crumb.label}`}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.current ? (
                    <BreadcrumbPage className="font-semibold text-gm-navy">
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      className="underline-offset-4 hover:text-gm-blue-ink hover:underline"
                      render={<Link href={crumb.href} />}
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
    </div>
  );
}
