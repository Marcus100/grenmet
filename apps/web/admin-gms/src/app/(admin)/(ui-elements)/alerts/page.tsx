import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Next.js Alerts | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Alerts page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
  // other metadata
};

export default function Alerts() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Alerts" />
      <div className="space-y-5 sm:space-y-6">
        <ComponentCard title="Success Alert">
          <Alert variant="success">
            <CheckCircle2 className="size-5" />
            <AlertTitle className="font-semibold text-gray-800 dark:text-white/90">
              Success Message
            </AlertTitle>
            <AlertDescription className="text-gray-500 dark:text-gray-400">
              Be cautious when performing this action.
              <Link
                className="mt-3 inline-block font-medium underline"
                href="/"
              >
                Learn more
              </Link>
            </AlertDescription>
          </Alert>
          <Alert variant="success">
            <CheckCircle2 className="size-5" />
            <AlertTitle className="font-semibold text-gray-800 dark:text-white/90">
              Success Message
            </AlertTitle>
            <AlertDescription className="text-gray-500 dark:text-gray-400">
              Be cautious when performing this action.
            </AlertDescription>
          </Alert>
        </ComponentCard>
        <ComponentCard title="Warning Alert">
          <Alert variant="warning">
            <AlertTriangle className="size-5" />
            <AlertTitle className="font-semibold text-gray-800 dark:text-white/90">
              Warning Message
            </AlertTitle>
            <AlertDescription className="text-gray-500 dark:text-gray-400">
              Be cautious when performing this action.
              <Link
                className="mt-3 inline-block font-medium underline"
                href="/"
              >
                Learn more
              </Link>
            </AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTriangle className="size-5" />
            <AlertTitle className="font-semibold text-gray-800 dark:text-white/90">
              Warning Message
            </AlertTitle>
            <AlertDescription className="text-gray-500 dark:text-gray-400">
              Be cautious when performing this action.
            </AlertDescription>
          </Alert>
        </ComponentCard>{" "}
        <ComponentCard title="Error Alert">
          <Alert variant="error">
            <XCircle className="size-5" />
            <AlertTitle className="font-semibold text-gray-800 dark:text-white/90">
              Error Message
            </AlertTitle>
            <AlertDescription className="text-gray-500 dark:text-gray-400">
              Be cautious when performing this action.
              <Link
                className="mt-3 inline-block font-medium underline"
                href="/"
              >
                Learn more
              </Link>
            </AlertDescription>
          </Alert>
          <Alert variant="error">
            <XCircle className="size-5" />
            <AlertTitle className="font-semibold text-gray-800 dark:text-white/90">
              Error Message
            </AlertTitle>
            <AlertDescription className="text-gray-500 dark:text-gray-400">
              Be cautious when performing this action.
            </AlertDescription>
          </Alert>
        </ComponentCard>{" "}
        <ComponentCard title="Info Alert">
          <Alert variant="info">
            <Info className="size-5" />
            <AlertTitle className="font-semibold text-gray-800 dark:text-white/90">
              Info Message
            </AlertTitle>
            <AlertDescription className="text-gray-500 dark:text-gray-400">
              Be cautious when performing this action.
              <Link
                className="mt-3 inline-block font-medium underline"
                href="/"
              >
                Learn more
              </Link>
            </AlertDescription>
          </Alert>
          <Alert variant="info">
            <Info className="size-5" />
            <AlertTitle className="font-semibold text-gray-800 dark:text-white/90">
              Info Message
            </AlertTitle>
            <AlertDescription className="text-gray-500 dark:text-gray-400">
              Be cautious when performing this action.
            </AlertDescription>
          </Alert>
        </ComponentCard>
      </div>
    </div>
  );
}
