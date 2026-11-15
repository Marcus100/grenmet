import { splitEmailAddresses } from "@barrelsgd/ui/lib/email-segments";
import { Fragment } from "react";

/**
 * Renders text with each email address in its own `<span>`, so Cloudflare Email
 * Address Obfuscation cannot split a text node around it and break hydration
 * (#1365). The visible text is unchanged. Use it wherever free text (a contact
 * line, for example) may contain an address.
 */
export function EmailText({ text }: { text: string }) {
  let offset = 0;
  return splitEmailAddresses(text).map((segment) => {
    // The offset of each segment is unique, so it serves as a stable key.
    const key = offset;
    offset += segment.text.length;
    return (
      <Fragment key={key}>
        {segment.isEmail ? <span>{segment.text}</span> : segment.text}
      </Fragment>
    );
  });
}
