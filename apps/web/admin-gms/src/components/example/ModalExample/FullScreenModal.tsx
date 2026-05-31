"use client";
import { Button } from "@grenmet/ui/components/ui/button";
import { Dialog, DialogContent } from "@grenmet/ui/components/ui/dialog";
import { useModal } from "@/hooks/useModal";
import ComponentCard from "../../common/ComponentCard";

export default function FullScreenModal() {
  const {
    isOpen: isFullscreenModalOpen,
    openModal: openFullscreenModal,
    closeModal: closeFullscreenModal,
  } = useModal();
  const handleSave = () => {
    closeFullscreenModal();
  };
  return (
    <ComponentCard title="Full Screen Modal">
      <Button onClick={openFullscreenModal} size="sm">
        Open Modal
      </Button>
      <Dialog
        onOpenChange={(open) => {
          if (!open) closeFullscreenModal();
        }}
        open={isFullscreenModalOpen}
      >
        <DialogContent className="fixed inset-0 h-screen max-w-none rounded-none p-0">
          <div className="fixed top-0 left-0 flex h-screen w-full flex-col justify-between overflow-y-auto overflow-x-hidden bg-background p-6 lg:p-10">
            <div>
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
                ligula ac odio condimentum aliquet a nec nulla. Aliquam bibendum
                ex sit amet ipsum rutrum feugiat ultrices enim quam odio
                condimentum aliquet a nec nulla pellentesque euismod est quis
                mauris lacinia pharetra.
              </p>
              <p className="mt-5 text-muted-foreground text-sm leading-6">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                Pellentesque euismod est quis mauris lacinia pharetra.
              </p>
            </div>
            <div className="mt-8 flex w-full items-center justify-end gap-3">
              <Button
                onClick={closeFullscreenModal}
                size="sm"
                variant="outline"
              >
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
