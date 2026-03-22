"use client";
import { Button } from "@grenmet/ui/components/ui/button";
import { useModal } from "@/hooks/useModal";
import ComponentCard from "../../common/ComponentCard";
import { Modal } from "../../ui/modal";

export default function VerticallyCenteredModal() {
  const { isOpen, openModal, closeModal } = useModal();
  const handleSave = () => {
    // Handle save logic here
    console.log("Saving changes...");
    closeModal();
  };
  return (
    <ComponentCard title="Vertically Centered Modal">
      <Button onClick={openModal} size="sm">
        Open Modal
      </Button>
      <Modal
        className="max-w-[507px] p-6 lg:p-10"
        isOpen={isOpen}
        onClose={closeModal}
        showCloseButton={false}
      >
        <div className="text-center">
          <h4 className="mb-2 font-semibold text-2xl text-gray-800 sm:text-title-sm dark:text-white/90">
            All Done! Success Confirmed
          </h4>
          <p className="text-gray-500 text-sm leading-6 dark:text-gray-400">
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
      </Modal>
    </ComponentCard>
  );
}
