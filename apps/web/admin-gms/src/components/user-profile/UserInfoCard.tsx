"use client";
import { Button } from "@/components/ui/button";
import { useModal } from "../../hooks/useModal";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { Modal } from "../ui/modal";

export default function UserInfoCard() {
  const { isOpen, openModal, closeModal } = useModal();
  const handleSave = () => {
    // Handle save logic here
    console.log("Saving changes...");
    closeModal();
  };
  return (
    <div className="rounded-2xl border border-gray-200 p-5 lg:p-6 dark:border-gray-800">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="font-semibold text-gray-800 text-lg lg:mb-6 dark:text-white/90">
            Personal Information
          </h4>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
            <div>
              <p className="mb-2 text-gray-500 text-xs leading-normal dark:text-gray-400">
                First Name
              </p>
              <p className="font-medium text-gray-800 text-sm dark:text-white/90">
                Musharof
              </p>
            </div>

            <div>
              <p className="mb-2 text-gray-500 text-xs leading-normal dark:text-gray-400">
                Last Name
              </p>
              <p className="font-medium text-gray-800 text-sm dark:text-white/90">
                Chowdhury
              </p>
            </div>

            <div>
              <p className="mb-2 text-gray-500 text-xs leading-normal dark:text-gray-400">
                Email address
              </p>
              <p className="font-medium text-gray-800 text-sm dark:text-white/90">
                randomuser@pimjo.com
              </p>
            </div>

            <div>
              <p className="mb-2 text-gray-500 text-xs leading-normal dark:text-gray-400">
                Phone
              </p>
              <p className="font-medium text-gray-800 text-sm dark:text-white/90">
                +09 363 398 46
              </p>
            </div>

            <div>
              <p className="mb-2 text-gray-500 text-xs leading-normal dark:text-gray-400">
                Bio
              </p>
              <p className="font-medium text-gray-800 text-sm dark:text-white/90">
                Team Manager
              </p>
            </div>
          </div>
        </div>

        <button
          className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 text-sm shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 lg:inline-flex lg:w-auto dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
          onClick={openModal}
        >
          <svg
            className="fill-current"
            fill="none"
            height="18"
            viewBox="0 0 18 18"
            width="18"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z"
              fill=""
              fillRule="evenodd"
            />
          </svg>
          Edit
        </button>
      </div>

      <Modal className="m-4 max-w-[700px]" isOpen={isOpen} onClose={closeModal}>
        <div className="no-scrollbar relative w-full max-w-[700px] overflow-y-auto rounded-3xl bg-white p-4 lg:p-11 dark:bg-gray-900">
          <div className="px-2 pr-14">
            <h4 className="mb-2 font-semibold text-2xl text-gray-800 dark:text-white/90">
              Edit Personal Information
            </h4>
            <p className="mb-6 text-gray-500 text-sm lg:mb-7 dark:text-gray-400">
              Update your details to keep your profile up-to-date.
            </p>
          </div>
          <form className="flex flex-col">
            <div className="custom-scrollbar h-[450px] overflow-y-auto px-2 pb-3">
              <div>
                <h5 className="mb-5 font-medium text-gray-800 text-lg lg:mb-6 dark:text-white/90">
                  Social Links
                </h5>

                <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                  <div>
                    <Label>Facebook</Label>
                    <Input
                      defaultValue="https://www.facebook.com/PimjoHQ"
                      type="text"
                    />
                  </div>

                  <div>
                    <Label>X.com</Label>
                    <Input defaultValue="https://x.com/PimjoHQ" type="text" />
                  </div>

                  <div>
                    <Label>Linkedin</Label>
                    <Input
                      defaultValue="https://www.linkedin.com/company/pimjo"
                      type="text"
                    />
                  </div>

                  <div>
                    <Label>Instagram</Label>
                    <Input
                      defaultValue="https://instagram.com/PimjoHQ"
                      type="text"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-7">
                <h5 className="mb-5 font-medium text-gray-800 text-lg lg:mb-6 dark:text-white/90">
                  Personal Information
                </h5>

                <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                  <div className="col-span-2 lg:col-span-1">
                    <Label>First Name</Label>
                    <Input defaultValue="Musharof" type="text" />
                  </div>

                  <div className="col-span-2 lg:col-span-1">
                    <Label>Last Name</Label>
                    <Input defaultValue="Chowdhury" type="text" />
                  </div>

                  <div className="col-span-2 lg:col-span-1">
                    <Label>Email Address</Label>
                    <Input defaultValue="randomuser@pimjo.com" type="text" />
                  </div>

                  <div className="col-span-2 lg:col-span-1">
                    <Label>Phone</Label>
                    <Input defaultValue="+09 363 398 46" type="text" />
                  </div>

                  <div className="col-span-2">
                    <Label>Bio</Label>
                    <Input defaultValue="Team Manager" type="text" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3 px-2 lg:justify-end">
              <Button onClick={closeModal} size="sm" variant="outline">
                Close
              </Button>
              <Button onClick={handleSave} size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
