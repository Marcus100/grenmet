import { CapAdminHeading } from "@/components/cap/admin-status";
import { CapImportForm } from "@/components/cap/import-form";

export default function ImportPage() {
  return (
    <CapAdminHeading title="Import a CAP alert">
      <CapImportForm />
    </CapAdminHeading>
  );
}
