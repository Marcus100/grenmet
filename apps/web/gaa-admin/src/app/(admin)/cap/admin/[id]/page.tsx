import { AlertWorkflow } from "@/components/cap/alert-workflow";

export default async function AlertWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AlertWorkflow alertId={id} key={id} />;
}
