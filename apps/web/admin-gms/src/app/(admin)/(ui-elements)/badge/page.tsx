import { Badge } from "@grenmet/ui/components/ui/badge";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

export const metadata: Metadata = {
  title: "Next.js Badge | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Badge page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
  // other metadata
};

export default function BadgePage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Badges" />
      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-2xl border border-border bg-background">
          <div className="px-6 py-5">
            <h3 className="font-medium text-base text-foreground">
              With Light Background
            </h3>
          </div>
          <div className="border-gray-100 border-t p-6 xl:p-10">
            <div className="flex flex-wrap gap-4 sm:items-center sm:justify-center">
              {/* Light Variant */}
              <Badge variant="light-primary">Primary</Badge>
              <Badge variant="light-success">Success</Badge>{" "}
              <Badge variant="light-error">Error</Badge>{" "}
              <Badge variant="light-warning">Warning</Badge>{" "}
              <Badge variant="light-info">Info</Badge>
              <Badge variant="light-light">Light</Badge>
              <Badge variant="light-dark">Dark</Badge>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background">
          <div className="px-6 py-5">
            <h3 className="font-medium text-base text-foreground">
              With Solid Background
            </h3>
          </div>
          <div className="border-gray-100 border-t p-6 xl:p-10">
            <div className="flex flex-wrap gap-4 sm:items-center sm:justify-center">
              {/* Solid Variant */}
              <Badge variant="solid-primary">Primary</Badge>
              <Badge variant="solid-success">Success</Badge>{" "}
              <Badge variant="solid-error">Error</Badge>{" "}
              <Badge variant="solid-warning">Warning</Badge>{" "}
              <Badge variant="solid-info">Info</Badge>
              <Badge variant="solid-light">Light</Badge>
              <Badge variant="solid-dark">Dark</Badge>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background">
          <div className="px-6 py-5">
            <h3 className="font-medium text-base text-foreground">
              Light Background with Left Icon
            </h3>
          </div>
          <div className="border-gray-100 border-t p-6 xl:p-10">
            <div className="flex flex-wrap gap-4 sm:items-center sm:justify-center">
              <Badge variant="light-primary">
                <Plus className="size-3" />
                Primary
              </Badge>
              <Badge variant="light-success">
                <Plus className="size-3" />
                Success
              </Badge>{" "}
              <Badge variant="light-error">
                <Plus className="size-3" />
                Error
              </Badge>{" "}
              <Badge variant="light-warning">
                <Plus className="size-3" />
                Warning
              </Badge>{" "}
              <Badge variant="light-info">
                <Plus className="size-3" />
                Info
              </Badge>
              <Badge variant="light-light">
                <Plus className="size-3" />
                Light
              </Badge>
              <Badge variant="light-dark">
                <Plus className="size-3" />
                Dark
              </Badge>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background">
          <div className="px-6 py-5">
            <h3 className="font-medium text-base text-foreground">
              Solid Background with Left Icon
            </h3>
          </div>
          <div className="border-gray-100 border-t p-6 xl:p-10">
            <div className="flex flex-wrap gap-4 sm:items-center sm:justify-center">
              <Badge variant="solid-primary">
                <Plus className="size-3" />
                Primary
              </Badge>
              <Badge variant="solid-success">
                <Plus className="size-3" />
                Success
              </Badge>{" "}
              <Badge variant="solid-error">
                <Plus className="size-3" />
                Error
              </Badge>{" "}
              <Badge variant="solid-warning">
                <Plus className="size-3" />
                Warning
              </Badge>{" "}
              <Badge variant="solid-info">
                <Plus className="size-3" />
                Info
              </Badge>
              <Badge variant="solid-light">
                <Plus className="size-3" />
                Light
              </Badge>
              <Badge variant="solid-dark">
                <Plus className="size-3" />
                Dark
              </Badge>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background">
          <div className="px-6 py-5">
            <h3 className="font-medium text-base text-foreground">
              Light Background with Right Icon
            </h3>
          </div>
          <div className="border-gray-100 border-t p-6 xl:p-10">
            <div className="flex flex-wrap gap-4 sm:items-center sm:justify-center">
              <Badge variant="light-primary">
                Primary
                <Plus className="size-3" />
              </Badge>
              <Badge variant="light-success">
                Success
                <Plus className="size-3" />
              </Badge>{" "}
              <Badge variant="light-error">
                Error
                <Plus className="size-3" />
              </Badge>{" "}
              <Badge variant="light-warning">
                Warning
                <Plus className="size-3" />
              </Badge>{" "}
              <Badge variant="light-info">
                Info
                <Plus className="size-3" />
              </Badge>
              <Badge variant="light-light">
                Light
                <Plus className="size-3" />
              </Badge>
              <Badge variant="light-dark">
                Dark
                <Plus className="size-3" />
              </Badge>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background">
          <div className="px-6 py-5">
            <h3 className="font-medium text-base text-foreground">
              Solid Background with Right Icon
            </h3>
          </div>
          <div className="border-gray-100 border-t p-6 xl:p-10">
            <div className="flex flex-wrap gap-4 sm:items-center sm:justify-center">
              <Badge variant="solid-primary">
                Primary
                <Plus className="size-3" />
              </Badge>
              <Badge variant="solid-success">
                Success
                <Plus className="size-3" />
              </Badge>{" "}
              <Badge variant="solid-error">
                Error
                <Plus className="size-3" />
              </Badge>{" "}
              <Badge variant="solid-warning">
                Warning
                <Plus className="size-3" />
              </Badge>{" "}
              <Badge variant="solid-info">
                Info
                <Plus className="size-3" />
              </Badge>
              <Badge variant="solid-light">
                Light
                <Plus className="size-3" />
              </Badge>
              <Badge variant="solid-dark">
                Dark
                <Plus className="size-3" />
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
