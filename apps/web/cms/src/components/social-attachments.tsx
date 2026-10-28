"use client";
import { useAllFormFields } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import {
  ATTACHMENT_KINDS,
  type AttachmentKind,
  attachmentHref,
  attachmentsView,
  type Fields,
} from "../lib/social-attachments-view";

const LABEL: Record<AttachmentKind, string> = {
  social: "social image",
  pdf: "PDF",
  map: "map",
};
/**
 * Downloads for the post's main link: a warning's social image, PDF and map,
 * straight from the warning system, so editors never re-create them. Other
 * kinds of main link have no generated images yet and say so.
 */
export const SocialAttachments: UIFieldClientComponent = () => {
  const [fields] = useAllFormFields();
  const view = attachmentsView(fields as Fields);

  return (
    <div className="field-type">
      <p style={{ fontWeight: 600, marginBottom: 4 }}>
        Images and files from the main link
      </p>
      {view.kind === "downloads" ? (
        <ul style={{ display: "flex", gap: 16, listStyle: "none", padding: 0 }}>
          {ATTACHMENT_KINDS.map((kind) => (
            <li key={kind}>
              <a
                download
                href={attachmentHref(view.identifier, kind)}
                rel="noopener"
              >
                Download {LABEL[kind]}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ opacity: 0.75 }}>
          {view.kind === "product"
            ? "Images for forecasts and bulletins are not generated yet. Upload one below."
            : "Make a warning the Main link under Related links to get its social image, PDF and map here."}
        </p>
      )}
    </div>
  );
};
