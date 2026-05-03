"use client";
import { Button } from "@grenmet/ui/components/ui/button";
import { useModal } from "@/hooks/useModal";
import ComponentCard from "../../common/ComponentCard";
import Input from "../../form/input/InputField";
import Label from "../../form/Label";
import { Modal } from "../../ui/modal";

export default function FormInModal() {
  const { isOpen, openModal, closeModal } = useModal();
  const handleSave = () => {
    closeModal();
  };
  return (
    <ComponentCard title="Form In Modal">
      <Button onClick={openModal} size="sm">
        Open Modal
      </Button>
      <Modal
        className="max-w-[584px] p-5 lg:p-10"
        isOpen={isOpen}
        onClose={closeModal}
      >
        <form className="">
          <h4 className="mb-6 font-medium text-gray-800 text-lg dark:text-white/90">
            Personal Information
          </h4>

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <div className="col-span-1">
              <Label>First Name</Label>
              <Input placeholder="Emirhan" type="text" />
            </div>

            <div className="col-span-1">
              <Label>Last Name</Label>
              <Input placeholder="Boruch" type="text" />
            </div>

            <div className="col-span-1">
              <Label>Last Name</Label>
              <Input placeholder="emirhanboruch55@gmail.com" type="email" />
            </div>

            <div className="col-span-1">
              <Label>Phone</Label>
              <Input placeholder="+09 363 398 46" type="text" />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <Label>Bio</Label>
              <Input placeholder="Team Manager" type="text" />
            </div>
          </div>

          <div className="mt-6 flex w-full items-center justify-end gap-3">
            <Button onClick={closeModal} size="sm" variant="outline">
              Close
            </Button>
            <Button onClick={handleSave} size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </ComponentCard>
  );
}
