// React 19 resets an uncontrolled <form action={fn}> once the action settles,
// even when it returned a refusal, which wipes what staff typed. Submit through
// onSubmit instead: the form is never auto-reset, so a refusal keeps every
// value. Success leaves the page (redirect) or unmounts the dialog, so nothing
// needs clearing. `pending` from useActionState still works inside a transition.
//
// When to use which:
// - onSubmit + startTransition (this helper): client forms driven by
//   useActionState whose success redirects or unmounts the form.
// - Return the submitted values from the server action and use them as
//   defaultValue: server actions that already echo the input back.

import { type FormEvent, startTransition } from "react";

export function keepValuesOnSubmit(formAction: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Pass the submitter so a named submit button still reaches the action.
    // jsdom and older engines may give no (or an invalid) submitter.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(
      event.currentTarget,
      submitter instanceof HTMLElement ? submitter : null
    );
    startTransition(() => {
      formAction(data);
    });
  };
}
