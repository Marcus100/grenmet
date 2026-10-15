import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";

/** Confirmation before a published product is withdrawn from GMS. */
export function ProductWithdrawDialog({
  onConfirm,
  onOpenChange,
  open,
  pending,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogTitle>Withdraw publication?</AlertDialogTitle>
        <AlertDialogDescription>
          This removes the published product from GMS. Its revision history
          remains. If this had an escalated CAP Alert, cancel it separately in
          CAP Admin — withdrawing here does not do that automatically.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            Confirm withdrawal
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
