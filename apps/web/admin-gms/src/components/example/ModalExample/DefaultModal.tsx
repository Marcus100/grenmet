"use client";
import { Button } from "@grenmet/ui/components/ui/button";
import { useModal } from "@/hooks/useModal";
import ComponentCard from "../../common/ComponentCard";
import { Modal } from "../../ui/modal";

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
        <Modal
          className="max-w-[600px] p-5 lg:p-10"
          isOpen={isOpen}
          onClose={closeModal}
        >
          <h4 className="mb-7 font-semibold text-gray-800 text-title-sm dark:text-white/90">
            Modal Heading
          </h4>
          <p className="text-gray-500 text-sm leading-6 dark:text-gray-400">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            Pellentesque euismod est quis mauris lacinia pharetra. Sed a ligula
            ac odio condimentum aliquet a nec nulla. Aliquam bibendum ex sit
            amet ipsum rutrum feugiat ultrices enim quam.
          </p>
          <p className="mt-5 text-gray-500 text-sm leading-6 dark:text-gray-400">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            Pellentesque euismod est quis mauris lacinia pharetra. Sed a ligula
            ac odio.
          </p>
          <div className="mt-8 flex w-full items-center justify-end gap-3">
            <Button onClick={closeModal} size="sm" variant="outline">
              Close
            </Button>
            <Button onClick={handleSave} size="sm">
              Save Changes
            </Button>
          </div>
        </Modal>
      </ComponentCard>
    </div>
  );
}
