import type { Route } from "next";
import Link from "next/link";

interface TransactionSummaryCardProps {
  count: number;
  href: string;
  subtitle: string;
  title: string;
}

export function TransactionSummaryCard({
  title,
  count,
  subtitle,
  href,
}: TransactionSummaryCardProps) {
  return (
    <div className="from-gm-blue to-gm-navy rounded-2xl bg-gradient-to-br p-5 text-white sm:p-6">
      <div className="mb-2">
        <h3 className="text-base font-bold tracking-wide uppercase sm:text-lg">
          {title}
        </h3>
        <p className="text-sm text-white/80">{subtitle}</p>
      </div>

      <div className="mb-6 text-3xl font-bold sm:mb-8 sm:text-4xl">{count}</div>

      <div className="flex justify-end">
        <Link
          className="-mr-4 inline-flex min-h-12 touch-manipulation items-center px-4 text-sm text-white/80 transition-colors hover:text-white"
          href={href as Route}
        >
          See more &gt;
        </Link>
      </div>
    </div>
  );
}
