"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateMyProfile } from "@/lib/account-profile-api";
import {
  apiFieldErrors,
  isSignedOut,
  NAME_FIELDS,
  type NameFormState,
  PHONE_FIELDS,
  PHONE_HELP,
  type PhoneFormState,
  readField,
  SIGN_IN_AGAIN,
} from "@/lib/profile-form";
import { reportError } from "@/lib/report-error";
import { requireSession } from "@/lib/session";

const NAME_LIMIT = 100;
const PHONE_LIMIT = 40;
const HAS_DIGIT = /\d/u;

function nameProblem(value: string, which: "first" | "last"): string | null {
  if (!value) return `Enter your ${which} name.`;
  if (value.length > NAME_LIMIT) {
    return `Use ${NAME_LIMIT} characters or fewer.`;
  }
  return null;
}

/**
 * Save the person's own first and last name. The API is the judge of the
 * values; this only refuses an empty or over-long field before calling it.
 * Nothing the person typed is reported.
 */
export async function saveNameAction(
  _previous: NameFormState,
  formData: FormData
): Promise<NameFormState> {
  const values = {
    first_name: readField(formData, "first_name"),
    last_name: readField(formData, "last_name"),
  };
  const first = nameProblem(values.first_name, "first");
  const last = nameProblem(values.last_name, "last");
  if (first || last) {
    return {
      fieldErrors: {
        ...(first ? { first_name: first } : {}),
        ...(last ? { last_name: last } : {}),
      },
      formError: null,
      values,
    };
  }

  const session = await requireSession("/profile/name");
  try {
    await updateMyProfile(session.accessToken, values);
  } catch (error) {
    const fieldErrors = apiFieldErrors(error, NAME_FIELDS);
    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors, formError: null, values };
    }
    if (isSignedOut(error)) {
      return { fieldErrors: {}, formError: SIGN_IN_AGAIN, values };
    }
    reportError(error, "account-profile-name");
    return {
      fieldErrors: {},
      formError: "Your name could not be saved. Try again.",
      values,
    };
  }
  revalidatePath("/");
  redirect("/?saved=name");
}

/**
 * Save or remove the person's own phone number. Blank removes it. The API
 * turns what was typed into the stored form and says what is wrong with it;
 * this only checks the basic shape. The number is never reported.
 */
export async function savePhoneAction(
  _previous: PhoneFormState,
  formData: FormData
): Promise<PhoneFormState> {
  const values = { phone: readField(formData, "phone") };
  if (
    values.phone &&
    (values.phone.length > PHONE_LIMIT || !HAS_DIGIT.test(values.phone))
  ) {
    return { fieldErrors: { phone: PHONE_HELP }, formError: null, values };
  }

  const session = await requireSession("/profile/phone");
  try {
    await updateMyProfile(session.accessToken, {
      phone: values.phone || null,
    });
  } catch (error) {
    const fieldErrors = apiFieldErrors(error, PHONE_FIELDS);
    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors, formError: null, values };
    }
    if (isAuthApiError(error) && error.status === 429) {
      return {
        fieldErrors: {},
        formError: "Too many changes. Wait a minute, then try again.",
        values,
      };
    }
    if (isSignedOut(error)) {
      return { fieldErrors: {}, formError: SIGN_IN_AGAIN, values };
    }
    reportError(error, "account-profile-phone");
    return {
      fieldErrors: {},
      formError: "Your phone number could not be saved. Try again.",
      values,
    };
  }
  revalidatePath("/");
  redirect(values.phone ? "/?saved=phone" : "/?saved=phone-removed");
}
