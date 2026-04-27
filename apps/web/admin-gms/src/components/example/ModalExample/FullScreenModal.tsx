"use client";
import { Button } from "@grenmet/ui/components/ui/button";
import { useModal } from "@/hooks/useModal";
import ComponentCard from "../../common/ComponentCard";
import { Modal } from "../../ui/modal";

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
      <Modal
        isFullscreen={true}
        isOpen={isFullscreenModalOpen}
        onClose={closeFullscreenModal}
        showCloseButton={true}
      >
        <div className="fixed top-0 left-0 flex h-screen w-full flex-col justify-between overflow-y-auto overflow-x-hidden bg-white p-6 lg:p-10 dark:bg-gray-900">
          <div>
            <h4 className="mb-7 font-semibold text-gray-800 text-title-sm dark:text-white/90">
              Modal Heading
            </h4>
            <p className="text-gray-500 text-sm leading-6 dark:text-gray-400">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Pellentesque euismod est quis mauris lacinia pharetra. Sed a
              ligula ac odio condimentum aliquet a nec nulla. Aliquam bibendum
              ex sit amet ipsum rutrum feugiat ultrices enim quam.
            </p>
            <p className="mt-5 text-gray-500 text-sm leading-6 dark:text-gray-400">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Pellentesque euismod est quis mauris lacinia pharetra. Sed a
              ligula ac odio condimentum aliquet a nec nulla. Aliquam bibendum
              ex sit amet ipsum rutrum feugiat ultrices enim quam odio
              condimentum aliquet a nec nulla pellentesque euismod est quis
              mauris lacinia pharetra.
            </p>
            <p className="mt-5 text-gray-500 text-sm leading-6 dark:text-gray-400">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              Pellentesque euismod est quis mauris lacinia pharetra.
            </p>
          </div>
          <div className="mt-8 flex w-full items-center justify-end gap-3">
            <Button onClick={closeFullscreenModal} size="sm" variant="outline">
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
