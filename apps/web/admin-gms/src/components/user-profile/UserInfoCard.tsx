"use client";

import type {
  Gender,
  Title,
  UserProfilePublic,
  UserProfileUpdateMe,
} from "@grenmet/api-client";
import { Button } from "@grenmet/ui/components/ui/button";
import { Dialog, DialogContent } from "@grenmet/ui/components/ui/dialog";
import { Input } from "@grenmet/ui/components/ui/input";
import { Label } from "@grenmet/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@grenmet/ui/components/ui/native-select";
import { useState } from "react";

const TITLE_OPTIONS: { label: string; value: Title }[] = [
  { value: "MR", label: "Mr" },
  { value: "MRS", label: "Mrs" },
  { value: "MS", label: "Ms" },
  { value: "MISS", label: "Miss" },
  { value: "DR", label: "Dr" },
];

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
  { value: "UNSPECIFIED", label: "Unspecified" },
];

interface UserInfoCardProps {
  isSaving: boolean;
  onSave: (payload: UserProfileUpdateMe) => Promise<void>;
  profile: UserProfilePublic;
}

export default function UserInfoCard({
  profile,
  isSaving,
  onSave,
}: UserInfoCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);
  const [title, setTitle] = useState<Title | "">(profile.profile.title || "");
  const [firstName, setFirstName] = useState(profile.profile.first_name);
  const [middleName, setMiddleName] = useState(
    profile.profile.middle_name || ""
  );
  const [lastName, setLastName] = useState(profile.profile.last_name);
  const [phone, setPhone] = useState(profile.identity.phone || "");
  const [nationality, setNationality] = useState(
    profile.profile.nationality || ""
  );
  const [gender, setGender] = useState<Gender | "">(
    profile.profile.gender || ""
  );
  const [emergencyName, setEmergencyName] = useState(
    profile.emergency_contact.name || ""
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    profile.emergency_contact.phone || ""
  );
  const [emergencyRelationship, setEmergencyRelationship] = useState(
    profile.emergency_contact.relationship || ""
  );

  const handleOpen = () => {
    setTitle(profile.profile.title || "");
    setFirstName(profile.profile.first_name);
    setMiddleName(profile.profile.middle_name || "");
    setLastName(profile.profile.last_name);
    setPhone(profile.identity.phone || "");
    setNationality(profile.profile.nationality || "");
    setGender(profile.profile.gender || "");
    setEmergencyName(profile.emergency_contact.name || "");
    setEmergencyPhone(profile.emergency_contact.phone || "");
    setEmergencyRelationship(profile.emergency_contact.relationship || "");
    openModal();
  };

  const handleSave = async () => {
    await onSave({
      profile: {
        title: title || null,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        phone: phone || null,
        nationality: nationality || null,
        gender: gender || null,
      },
      emergency_contact: {
        name: emergencyName || null,
        phone: emergencyPhone || null,
        relationship: emergencyRelationship || null,
      },
    });
    closeModal();
  };

  const fullName = `${profile.profile.first_name} ${profile.profile.last_name}`;

  return (
    <div className="rounded-2xl border border-border p-5 lg:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="font-semibold text-foreground text-lg lg:mb-6">
            Personal Information
          </h4>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Title
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.profile.title || "-"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                First Name
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.profile.first_name}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Middle Name
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.profile.middle_name || "-"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Last Name
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.profile.last_name}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Email address
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.identity.email}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Phone
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.identity.phone || "-"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Display Name
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.profile.display_name || fullName}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Nationality
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.profile.nationality || "-"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Gender
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.profile.gender || "-"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Emergency Contact
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.emergency_contact.name || "-"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Emergency Phone
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.emergency_contact.phone || "-"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs leading-normal">
                Emergency Relationship
              </p>
              <p className="font-medium text-foreground text-sm">
                {profile.emergency_contact.relationship || "-"}
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
            <title>Edit personal information</title>
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

      <Dialog
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        open={isOpen}
      >
        <DialogContent className="m-4 max-w-[700px]">
          <div className="relative w-full max-w-[700px] overflow-y-auto rounded-3xl bg-background p-4 lg:p-11">
            <div className="px-2 pr-14">
              <h4 className="mb-2 font-semibold text-2xl text-foreground">
                Edit Personal Information
              </h4>
              <p className="mb-6 text-muted-foreground text-sm lg:mb-7">
                Update your details to keep your profile up-to-date.
              </p>
            </div>
            <form className="flex flex-col">
              <div className="h-[450px] overflow-y-auto px-2 pb-3">
                <div>
                  <h5 className="mb-5 font-medium text-foreground text-lg lg:mb-6">
                    Social Links
                  </h5>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                    <div>
                      <Label className="mb-1.5">Facebook</Label>
                      <Input
                        defaultValue="https://www.facebook.com/PimjoHQ"
                        type="text"
                      />
                    </div>

                    <div>
                      <Label className="mb-1.5">X.com</Label>
                      <Input defaultValue="https://x.com/PimjoHQ" type="text" />
                    </div>

                    <div>
                      <Label className="mb-1.5">Linkedin</Label>
                      <Input
                        defaultValue="https://www.linkedin.com/company/pimjo"
                        type="text"
                      />
                    </div>

                    <div>
                      <Label className="mb-1.5">Instagram</Label>
                      <Input
                        defaultValue="https://instagram.com/PimjoHQ"
                        type="text"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-7">
                  <h5 className="mb-5 font-medium text-foreground text-lg lg:mb-6">
                    Personal Information
                  </h5>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Title</Label>
                      <NativeSelect
                        className="w-full"
                        onChange={(event) =>
                          setTitle(event.target.value as Title | "")
                        }
                        value={title}
                      >
                        <NativeSelectOption value="">
                          Select title
                        </NativeSelectOption>
                        {TITLE_OPTIONS.map((option) => (
                          <NativeSelectOption
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">First Name</Label>
                      <Input
                        onChange={(event) => setFirstName(event.target.value)}
                        type="text"
                        value={firstName}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Middle Name</Label>
                      <Input
                        onChange={(event) => setMiddleName(event.target.value)}
                        type="text"
                        value={middleName}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Last Name</Label>
                      <Input
                        onChange={(event) => setLastName(event.target.value)}
                        type="text"
                        value={lastName}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Email Address</Label>
                      <Input
                        defaultValue={profile.identity.email}
                        disabled
                        type="text"
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Phone</Label>
                      <Input
                        onChange={(event) => setPhone(event.target.value)}
                        type="text"
                        value={phone}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Nationality</Label>
                      <Input
                        onChange={(event) => setNationality(event.target.value)}
                        type="text"
                        value={nationality}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Gender</Label>
                      <NativeSelect
                        className="w-full"
                        onChange={(event) =>
                          setGender(event.target.value as Gender | "")
                        }
                        value={gender}
                      >
                        <NativeSelectOption value="">
                          Select gender
                        </NativeSelectOption>
                        {GENDER_OPTIONS.map((option) => (
                          <NativeSelectOption
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Emergency Contact Name</Label>
                      <Input
                        onChange={(event) =>
                          setEmergencyName(event.target.value)
                        }
                        type="text"
                        value={emergencyName}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Emergency Contact Phone</Label>
                      <Input
                        onChange={(event) =>
                          setEmergencyPhone(event.target.value)
                        }
                        type="text"
                        value={emergencyPhone}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5">Emergency Relationship</Label>
                      <Input
                        onChange={(event) =>
                          setEmergencyRelationship(event.target.value)
                        }
                        type="text"
                        value={emergencyRelationship}
                      />
                    </div>
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
    </div>
  );
}
