"use client";

import type {
  Gender,
  Title,
  UserProfilePublic,
  UserProfileUpdateMe,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { useId, useState } from "react";

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

interface Draft {
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  firstName: string;
  gender: Gender | "";
  lastName: string;
  middleName: string;
  nationality: string;
  phone: string;
  title: Title | "";
}

/** The editable form values for a profile, with empty strings for blanks. */
function draftFrom(profile: UserProfilePublic): Draft {
  return {
    title: profile.profile.title || "",
    firstName: profile.profile.first_name,
    middleName: profile.profile.middle_name || "",
    lastName: profile.profile.last_name,
    phone: profile.identity.phone || "",
    nationality: profile.profile.nationality || "",
    gender: profile.profile.gender || "",
    emergencyName: profile.emergency_contact.name || "",
    emergencyPhone: profile.emergency_contact.phone || "",
    emergencyRelationship: profile.emergency_contact.relationship || "",
  };
}

/** The update payload for the form values; blank fields are sent as null. */
function payloadFrom(draft: Draft): UserProfileUpdateMe {
  return {
    profile: {
      title: draft.title || null,
      first_name: draft.firstName,
      middle_name: draft.middleName || null,
      last_name: draft.lastName,
      phone: draft.phone || null,
      nationality: draft.nationality || null,
      gender: draft.gender || null,
    },
    emergency_contact: {
      name: draft.emergencyName || null,
      phone: draft.emergencyPhone || null,
      relationship: draft.emergencyRelationship || null,
    },
  };
}

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
  const fieldId = useId();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = isSaving || submitting;
  const [isOpen, setIsOpen] = useState(false);
  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);
  const initial = draftFrom(profile);
  const [title, setTitle] = useState<Title | "">(initial.title);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [middleName, setMiddleName] = useState(initial.middleName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [phone, setPhone] = useState(initial.phone);
  const [nationality, setNationality] = useState(initial.nationality);
  const [gender, setGender] = useState<Gender | "">(initial.gender);
  const [emergencyName, setEmergencyName] = useState(initial.emergencyName);
  const [emergencyPhone, setEmergencyPhone] = useState(initial.emergencyPhone);
  const [emergencyRelationship, setEmergencyRelationship] = useState(
    initial.emergencyRelationship
  );

  const handleOpen = () => {
    const draft = draftFrom(profile);
    setError("");
    setTitle(draft.title);
    setFirstName(draft.firstName);
    setMiddleName(draft.middleName);
    setLastName(draft.lastName);
    setPhone(draft.phone);
    setNationality(draft.nationality);
    setGender(draft.gender);
    setEmergencyName(draft.emergencyName);
    setEmergencyPhone(draft.emergencyPhone);
    setEmergencyRelationship(draft.emergencyRelationship);
    openModal();
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError("");
    try {
      await onSave(
        payloadFrom({
          title,
          firstName,
          middleName,
          lastName,
          phone,
          nationality,
          gender,
          emergencyName,
          emergencyPhone,
          emergencyRelationship,
        })
      );
      closeModal();
    } catch {
      setError("Unable to save your changes. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const fullName = `${profile.profile.first_name} ${profile.profile.last_name}`;

  return (
    <div className="border-border rounded-xl border p-5 lg:p-6">
      {isOpen ? (
        <div className="w-full">
          <div className="px-2 pr-14">
            <h4 className="text-foreground mb-2 text-2xl font-semibold">
              Edit Personal Information
            </h4>
            <p className="text-muted-foreground mb-6 text-sm lg:mb-7">
              Update your details to keep your profile up-to-date.
            </p>
          </div>
          <form
            className="flex flex-col"
            onSubmit={async (event) => {
              event.preventDefault();
              await handleSave();
            }}
          >
            <p
              className="text-destructive mb-4 text-sm"
              hidden={!error}
              role="alert"
            >
              {error}
            </p>
            <fieldset className="min-w-0" disabled={busy}>
              <div className="px-2 pb-3">
                <div className="mt-7">
                  <h5 className="text-foreground mb-5 text-lg font-medium lg:mb-6">
                    Personal Information
                  </h5>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5" htmlFor={`${fieldId}-title`}>
                        Title
                      </Label>
                      <NativeSelect
                        className="w-full"
                        id={`${fieldId}-title`}
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
                      <Label
                        className="mb-1.5"
                        htmlFor={`${fieldId}-first-name`}
                      >
                        First Name
                      </Label>
                      <Input
                        id={`${fieldId}-first-name`}
                        onChange={(event) => setFirstName(event.target.value)}
                        type="text"
                        value={firstName}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label
                        className="mb-1.5"
                        htmlFor={`${fieldId}-middle-name`}
                      >
                        Middle Name
                      </Label>
                      <Input
                        id={`${fieldId}-middle-name`}
                        onChange={(event) => setMiddleName(event.target.value)}
                        type="text"
                        value={middleName}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label
                        className="mb-1.5"
                        htmlFor={`${fieldId}-last-name`}
                      >
                        Last Name
                      </Label>
                      <Input
                        id={`${fieldId}-last-name`}
                        onChange={(event) => setLastName(event.target.value)}
                        type="text"
                        value={lastName}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label
                        className="mb-1.5"
                        htmlFor={`${fieldId}-email-address`}
                      >
                        Email Address
                      </Label>
                      <Input
                        defaultValue={profile.identity.email}
                        disabled
                        id={`${fieldId}-email-address`}
                        type="text"
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5" htmlFor={`${fieldId}-phone`}>
                        Phone
                      </Label>
                      <Input
                        id={`${fieldId}-phone`}
                        onChange={(event) => setPhone(event.target.value)}
                        type="text"
                        value={phone}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label
                        className="mb-1.5"
                        htmlFor={`${fieldId}-nationality`}
                      >
                        Nationality
                      </Label>
                      <Input
                        id={`${fieldId}-nationality`}
                        onChange={(event) => setNationality(event.target.value)}
                        type="text"
                        value={nationality}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label className="mb-1.5" htmlFor={`${fieldId}-gender`}>
                        Gender
                      </Label>
                      <NativeSelect
                        className="w-full"
                        id={`${fieldId}-gender`}
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
                      <Label
                        className="mb-1.5"
                        htmlFor={`${fieldId}-emergency-contact-name`}
                      >
                        Emergency Contact Name
                      </Label>
                      <Input
                        id={`${fieldId}-emergency-contact-name`}
                        onChange={(event) =>
                          setEmergencyName(event.target.value)
                        }
                        type="text"
                        value={emergencyName}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label
                        className="mb-1.5"
                        htmlFor={`${fieldId}-emergency-contact-phone`}
                      >
                        Emergency Contact Phone
                      </Label>
                      <Input
                        id={`${fieldId}-emergency-contact-phone`}
                        onChange={(event) =>
                          setEmergencyPhone(event.target.value)
                        }
                        type="text"
                        value={emergencyPhone}
                      />
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <Label
                        className="mb-1.5"
                        htmlFor={`${fieldId}-emergency-relationship`}
                      >
                        Emergency Relationship
                      </Label>
                      <Input
                        id={`${fieldId}-emergency-relationship`}
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
                  Cancel
                </Button>
                <Button disabled={busy} size="sm" type="submit">
                  {busy ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </fieldset>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="text-foreground text-lg font-semibold lg:mb-6">
              Personal Information
            </h4>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Title
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.profile.title || "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  First Name
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.profile.first_name}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Middle Name
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.profile.middle_name || "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Last Name
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.profile.last_name}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Email address
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.identity.email}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Phone
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.identity.phone || "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Display Name
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.profile.display_name || fullName}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Nationality
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.profile.nationality || "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Gender
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.profile.gender || "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Emergency Contact
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.emergency_contact.name || "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Emergency Phone
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.emergency_contact.phone || "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-xs leading-normal">
                  Emergency Relationship
                </p>
                <p className="text-foreground text-sm font-medium">
                  {profile.emergency_contact.relationship || "-"}
                </p>
              </div>
            </div>
          </div>

          <button
            className="border-border bg-background text-foreground shadow-card hover:bg-muted hover:text-foreground flex w-full items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-medium lg:inline-flex lg:w-auto"
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
      )}
    </div>
  );
}
