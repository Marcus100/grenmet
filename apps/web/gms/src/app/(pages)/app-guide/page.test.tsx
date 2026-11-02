import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import AppGuidePage from "./page";

const CHANNELS = /by email and browser notifications/u;
const WHATSAPP = /whatsapp/iu;

it("names the alert channels that really exist, and no WhatsApp", () => {
  const { container } = render(<AppGuidePage />);
  expect(screen.getByText(CHANNELS)).toBeInTheDocument();
  expect(container).not.toHaveTextContent(WHATSAPP);
});
