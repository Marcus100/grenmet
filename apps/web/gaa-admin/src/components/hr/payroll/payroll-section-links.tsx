import Link from "next/link";

const SECTIONS = [
  { href: "/hr/payroll", label: "Payroll inputs" },
  { href: "/hr/payroll/pay-rates", label: "Pay rates" },
  { href: "/hr/payroll/tables", label: "Tax and deductions" },
  { href: "/hr/payroll/my-payslips", label: "My payslips" },
  { href: "/hr/payroll/my-deductions", label: "My deductions" },
] as const;

/** Links between the payroll screens. Each section still checks its own access. */
export function PayrollSectionLinks() {
  return (
    <nav
      aria-label="Payroll sections"
      className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
    >
      {SECTIONS.map((section) => (
        <Link
          className="text-info underline-offset-4 hover:underline"
          href={section.href}
          key={section.href}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
