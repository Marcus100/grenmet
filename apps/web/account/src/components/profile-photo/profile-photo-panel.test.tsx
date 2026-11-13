import { configureApiClient } from "@barrelsgd/api-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { initialsFor, ProfilePhotoPanel } from "./profile-photo-panel";

const BASE = "http://localhost";
const ME = `${BASE}/api/v1/profile-images/me`;
const PHOTO = {
  user_id: "11111111-1111-4111-8111-111111111111",
  version: "v2",
  updated_at: "2026-11-13T10:00:00Z",
  sizes: [64, 256, 512],
};

const SAVED_NOTICE = /Photo saved\. People who share an organisation/u;
const SAVED_PREFIX = /Photo saved/u;

interface Sent {
  contentType: string | null;
  method: string;
  url: string;
}

const server = setupServer();
let sent: Sent[] = [];
let uploadReply: () => Response = () =>
  HttpResponse.json(PHOTO, { status: 200 });
let removeReply: () => Response = () => new HttpResponse(null, { status: 204 });

function record(request: Request): void {
  sent.push({
    contentType: request.headers.get("content-type"),
    method: request.method,
    url: request.url,
  });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  configureApiClient({ baseURL: BASE });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  sent = [];
  uploadReply = () => HttpResponse.json(PHOTO, { status: 200 });
  removeReply = () => new HttpResponse(null, { status: 204 });
});

afterAll(() => server.close());

function mountPanel(initialPhoto: typeof PHOTO | null = null) {
  server.use(
    http.put(ME, ({ request }) => {
      record(request);
      return uploadReply();
    }),
    http.delete(ME, ({ request }) => {
      record(request);
      return removeReply();
    })
  );
  return render(
    <ProfilePhotoPanel
      email="ada@example.com"
      initialPhoto={initialPhoto}
      name="Ada Lovelace"
      userId={PHOTO.user_id}
    />
  );
}

function chooseFile(file: File): void {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input missing");
  fireEvent.change(input, { target: { files: [file] } });
}

function photoFile(
  type: string,
  name = "photo.png",
  bytes = "image-bytes"
): File {
  return new File([bytes], name, { type });
}

describe("ProfilePhotoPanel: choosing a file", () => {
  it("refuses a format the API does not take, and sends nothing", async () => {
    mountPanel();
    chooseFile(photoFile("image/gif", "photo.gif"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG or WebP photo."
    );
    expect(sent).toHaveLength(0);
  });

  it("refuses a file over 5 MB before uploading it", async () => {
    mountPanel();
    const big = photoFile("image/jpeg", "big.jpg");
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    chooseFile(big);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That photo is larger than 5 MB. Choose a smaller one."
    );
    expect(sent).toHaveLength(0);
  });

  it("uploads a PNG with its own Content-Type and shows the saved state", async () => {
    mountPanel();
    chooseFile(photoFile("image/png"));
    expect(await screen.findByText(SAVED_NOTICE)).toBeInTheDocument();
    expect(sent).toEqual([
      { contentType: "image/png", method: "PUT", url: ME },
    ]);
    expect(
      screen.getByRole("button", { name: "Remove photo" })
    ).toBeInTheDocument();
    expect(screen.getByText("Replace photo")).toBeInTheDocument();
  });

  it("sends a WebP upload with the WebP Content-Type", async () => {
    mountPanel();
    chooseFile(photoFile("image/webp", "photo.webp"));
    await screen.findByText(SAVED_PREFIX);
    expect(sent[0]?.contentType).toBe("image/webp");
  });
});

describe("ProfilePhotoPanel: the API's answer", () => {
  it("shows the API's reason when it refuses the photo", async () => {
    uploadReply = () =>
      HttpResponse.json(
        { detail: "The photo must be at least 32 pixels on each side." },
        { status: 422 }
      );
    mountPanel();
    chooseFile(photoFile("image/jpeg", "tiny.jpg"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The photo must be at least 32 pixels on each side."
    );
    expect(screen.getByText("Upload photo")).toBeInTheDocument();
  });

  it("shows the size message from a 413", async () => {
    uploadReply = () =>
      HttpResponse.json(
        { detail: "The photo must be 5 MB or smaller." },
        { status: 413 }
      );
    mountPanel();
    chooseFile(photoFile("image/jpeg", "large.jpg"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The photo must be 5 MB or smaller."
    );
  });

  it("falls back to a plain message for a server error with no reason", async () => {
    uploadReply = () =>
      HttpResponse.json({ detail: "Internal error" }, { status: 500 });
    mountPanel();
    chooseFile(photoFile("image/png"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The photo could not be saved. Try again."
    );
  });
});

describe("ProfilePhotoPanel: removing a photo", () => {
  it("deletes the photo and falls back to initials", async () => {
    mountPanel(PHOTO);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(
      await screen.findByText("Photo removed. Your initials show instead.")
    ).toBeInTheDocument();
    expect(sent).toEqual([{ contentType: null, method: "DELETE", url: ME }]);
    expect(screen.getByText("Upload photo")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove photo" })
    ).not.toBeInTheDocument();
  });

  it("treats a 404 on removal as already removed", async () => {
    removeReply = () =>
      HttpResponse.json({ detail: "No photo" }, { status: 404 });
    mountPanel(PHOTO);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await waitFor(() =>
      expect(screen.getByText("Upload photo")).toBeInTheDocument()
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the photo and says why when removal fails", async () => {
    removeReply = () =>
      HttpResponse.json({ detail: "Storage is unavailable" }, { status: 503 });
    mountPanel(PHOTO);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storage is unavailable"
    );
    expect(
      screen.getByRole("button", { name: "Remove photo" })
    ).toBeInTheDocument();
  });
});

describe("initialsFor", () => {
  it("uses the first letters of the name, then the email", () => {
    expect(initialsFor("Ada Lovelace", "ada@example.com")).toBe("AL");
    expect(initialsFor("  ", "grace.hopper@example.com")).toBe("GH");
    expect(initialsFor(null, "linus@example.com")).toBe("L");
    expect(initialsFor("Mary-Anne Jones Smith", "x@y.z")).toBe("MA");
    expect(initialsFor(null, "")).toBe("?");
  });
});
