"use client";
import { Button } from "@grenmet/ui/components/ui/button";
import { Dialog, DialogContent } from "@grenmet/ui/components/ui/dialog";
import { useModal } from "@/hooks/useModal";
import ComponentCard from "../../common/ComponentCard";

export default function VerticallyCenteredModal() {
  const { isOpen, openModal, closeModal } = useModal();
  const handleSave = () => {
    closeModal();
  };
  return (
    <ComponentCard title="Vertically Centered Modal">
      <Button onClick={openModal} size="sm">
        Open Modal
      </Button>
      <Dialog
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        open={isOpen}
      >
        <DialogContent
          className="max-w-[507px] p-6 lg:p-10"
          showCloseButton={false}
        >
          <div className="text-center">
            <h4 className="mb-2 font-semibold text-2xl text-foreground sm:text-title-sm">
              All Done! Success Confirmed
            </h4>
            <p className="text-muted-foreground text-sm leading-6">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Pellentesque euismod est quis mauris lacinia pharetra.
            </p>

            <div className="mt-8 flex w-full items-center justify-center gap-3">
              <Button onClick={closeModal} size="sm" variant="outline">
                Close
              </Button>
              <Button onClick={handleSave} size="sm">
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ComponentCard>
  );
}
