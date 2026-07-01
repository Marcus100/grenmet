"use client";

import type {
  Parish,
  UserProfilePublic,
  UserProfileUpdateMe,
} from "@grenmet/api-client";
import { Button } from "@grenmet/ui/components/ui/button";
import { Dialog, DialogContent } from "@grenmet/ui/components/ui/dialog";
import { Input } from "@grenmet/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@grenmet/ui/components/ui/native-select";
import { useState } from "react";
import { useModal } from "../../hooks/useModal";
import Label from "../form/Label";

const PARISH_OPTIONS: { label: string; value: Parish }[] = [
  { value: "SAINT_GEORGE", label: "St. George" },
  { value: "SAINT_ANDREW", label: "St. Andrew" },
  { value: "SAINT_DAVID", label: "St. David" },
  { value: "SAINT_JOHN", label: "St. John" },
  { value: "SAINT_MARK", label: "St. Mark" },
  { value: "SAINT_PATRICK", label: "St. Patrick" },
  { value: "CARRIACOU", label: "Carriacou" },
  { value: "PETITE_MARTINIQUE", label: "Petite Martinique" },
];

interface UserAddressCardProps {
  isSaving: boolean;
  onSave: (payload: UserProfileUpdateMe) => Promise<void>;
  profile: UserProfilePublic;
}

export default function UserAddressCard({
  profile,
  isSaving,
  onSave,
}: UserAddressCardProps) {
  const { isOpen, openModal, closeModal } = useModal();
  const [line1, setLine1] = useState(profile.address.line_1 || "");
  const [line2, setLine2] = useState(profile.address.line_2 || "");
  const [city, setCity] = useState(profile.address.city || "");
  const [parish, setParish] = useState<Parish | "">(
    profile.address.parish || ""
  );
  const [postalCode, setPostalCode] = useState(
    profile.address.postal_code || ""
  );
  const [country, setCountry] = useState(profile.address.country || "");

  const handleOpen = () => {
    setLine1(profile.address.line_1 || "");
    setLine2(profile.address.line_2 || "");
    setCity(profile.address.city || "");
    setParish(profile.address.parish || "");
    setPostalCode(profile.address.postal_code || "");
    setCountry(profile.address.country || "");
    openModal();
  };

  const handleSave = async () => {
    await onSave({
      address: {
        line_1: line1 || null,
        line_2: line2 || null,
        city: city || null,
        parish: parish || null,
        postal_code: postalCode || null,
        country: country || null,
      },
    });
    closeModal();
  };
  return (
    <>
      <div className="rounded-2xl border border-border p-5 lg:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="font-semibold text-foreground text-lg lg:mb-6">
              Address
            </h4>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
              <div>
                <p className="mb-2 text-muted-foreground text-xs leading-normal">
                  Address Line 1
                </p>
                <p className="font-medium text-foreground text-sm">
                  {profile.address.line_1 || "-"}
                </p>
              </div>

              <div>
                <p className="mb-2 text-muted-foreground text-xs leading-normal">
                  Address Line 2
                </p>
                <p className="font-medium text-foreground text-sm">
                  {profile.address.line_2 || "-"}
                </p>
              </div>

              <div>
                <p className="mb-2 text-muted-foreground text-xs leading-normal">
                  City
                </p>
                <p className="font-medium text-foreground text-sm">
                  {profile.address.city || "-"}
                </p>
              </div>

              <div>
                <p className="mb-2 text-muted-foreground text-xs leading-normal">
                  Parish
                </p>
                <p className="font-medium text-foreground text-sm">
                  {profile.address.parish || "-"}
                </p>
              </div>

              <div>
                <p className="mb-2 text-muted-foreground text-xs leading-normal">
                  Postal Code
                </p>
                <p className="font-medium text-foreground text-sm">
                  {profile.address.postal_code || "-"}
                </p>
              </div>

              <div>
                <p className="mb-2 text-muted-foreground text-xs leading-normal">
                  Country
                </p>
                <p className="font-medium text-foreground text-sm">
                  {profile.address.country || "-"}
                </p>
              </div>
            </div>
          </div>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-3 font-medium text-foreground text-sm shadow-gm-card hover:bg-muted hover:text-foreground lg:inline-flex lg:w-auto"
            onClick={handleOpen}
            type="button"
          >
            <svg
              className="fill-current"
              fill="none"
              height="18"
              viewBox="0 0 18 18"
              width="18"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>Edit address information</title>
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
      </div>
      <Dialog
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        open={isOpen}
      >
        <DialogContent className="m-4 max-w-[700px]">
          <div className="no-scrollbar relative w-full overflow-y-auto rounded-3xl bg-background p-4 lg:p-11">
            <div className="px-2 pr-14">
              <h4 className="mb-2 font-semibold text-2xl text-foreground">
                Edit Address
              </h4>
              <p className="mb-6 text-muted-foreground text-sm lg:mb-7">
                Update your details to keep your profile up-to-date.
              </p>
            </div>
            <form className="flex flex-col">
              <div className="custom-scrollbar overflow-y-auto px-2">
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                  <div>
                    <Label>Address Line 1</Label>
                    <Input
                      defaultValue={line1}
                      key={`line1-${line1}`}
                      onChange={(event) => setLine1(event.target.value)}
                      type="text"
                    />
                  </div>

                  <div>
                    <Label>Address Line 2</Label>
                    <Input
                      defaultValue={line2}
                      key={`line2-${line2}`}
                      onChange={(event) => setLine2(event.target.value)}
                      type="text"
                    />
                  </div>

                  <div>
                    <Label>City</Label>
                    <Input
                      defaultValue={city}
                      key={`city-${city}`}
                      onChange={(event) => setCity(event.target.value)}
                      type="text"
                    />
                  </div>

                  <div>
                    <Label>Parish</Label>
                    <NativeSelect
                      className="w-full"
                      key={`parish-${parish}`}
                      onChange={(event) =>
                        setParish(event.target.value as Parish | "")
                      }
                      value={parish}
                    >
                      <NativeSelectOption value="">
                        Select parish
                      </NativeSelectOption>
                      {PARISH_OPTIONS.map((option) => (
                        <NativeSelectOption
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>

                  <div>
                    <Label>Postal Code</Label>
                    <Input
                      defaultValue={postalCode}
                      key={`postal-code-${postalCode}`}
                      onChange={(event) => setPostalCode(event.target.value)}
                      type="text"
                    />
                  </div>

                  <div>
                    <Label>Country</Label>
                    <Input
                      defaultValue={country}
                      key={`country-${country}`}
                      onChange={(event) => setCountry(event.target.value)}
                      type="text"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3 px-2 lg:justify-end">
                <Button
                  onClick={closeModal}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Close
                </Button>
                <Button
                  disabled={isSaving}
                  onClick={handleSave}
                  size="sm"
                  type="button"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
