// React 19 resets an uncontrolled <form action={fn}> once the action settles,
// even when it returned a refusal, which wipes what staff typed. Submit through
// onSubmit instead: the form is never auto-reset, so a refusal keeps every
// value. Success leaves the page (redirect) or unmounts the dialog, so nothing
// needs clearing. `pending` from useActionState still works inside a transition.

import { type FormEvent, startTransition } from "react";

export function keepValuesOnSubmit(formAction: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  };
}
