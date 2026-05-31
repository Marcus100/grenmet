"use client";
import { Button } from "@grenmet/ui/components/ui/button";
import { Dialog, DialogContent } from "@grenmet/ui/components/ui/dialog";
import { useModal } from "@/hooks/useModal";
import ComponentCard from "../../common/ComponentCard";

export default function DefaultModal() {
  const { isOpen, openModal, closeModal } = useModal();
  const handleSave = () => {
    closeModal();
  };
  return (
    <div>
      <ComponentCard title="Default Modal">
        <Button onClick={openModal} size="sm">
          Open Modal
        </Button>
        <Dialog
          onOpenChange={(open) => {
            if (!open) closeModal();
          }}
          open={isOpen}
        >
          <DialogContent className="max-w-[600px] p-5 lg:p-10">
            <h4 className="mb-7 font-semibold text-foreground text-title-sm">
              Modal Heading
            </h4>
            <p className="text-muted-foreground text-sm leading-6">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Pellentesque euismod est quis mauris lacinia pharetra. Sed a
              ligula ac odio condimentum aliquet a nec nulla. Aliquam bibendum
              ex sit amet ipsum rutrum feugiat ultrices enim quam.
            </p>
            <p className="mt-5 text-muted-foreground text-sm leading-6">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Pellentesque euismod est quis mauris lacinia pharetra. Sed a
              ligula ac odio.
            </p>
            <div className="mt-8 flex w-full items-center justify-end gap-3">
              <Button onClick={closeModal} size="sm" variant="outline">
                Close
              </Button>
              <Button onClick={handleSave} size="sm">
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </ComponentCard>
    </div>
  );
}
