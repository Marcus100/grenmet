import { SECONDARY_ACTION } from "@/components/studio/studio-ui";
import { telHref, whatsappHref } from "@/lib/phone";

/**
 * Call and WhatsApp for a customer's phone number. Call shows for any number
 * with a digit in it; WhatsApp only when the number can be made
 * international (`whatsappHref`). The number goes only into the `tel:` and
 * `wa.me` paths, never a query string, and is never logged.
 */
export function ContactButtons({
  phone,
}: Readonly<{ phone: string | null | undefined }>) {
  const call = telHref(phone);
  const chat = whatsappHref(phone);
  if (!(call || chat)) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {call ? (
        <a className={SECONDARY_ACTION} href={call}>
          Call
        </a>
      ) : null}
      {chat ? (
        <a
          className={SECONDARY_ACTION}
          href={chat}
          rel="noopener noreferrer"
          target="_blank"
        >
          WhatsApp
        </a>
      ) : null}
    </div>
  );
}
