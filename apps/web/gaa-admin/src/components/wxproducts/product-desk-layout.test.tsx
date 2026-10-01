import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProductDeskLayout } from "./product-desk-layout";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("places one archive card below the shorter panel and responds to content resizing", () => {
  let editorHeight = 900;
  const resize = {
    notify: (): void => undefined,
    disconnect: vi.fn(),
    observe: vi.fn(),
  };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize.notify = callback;
      }
      observe = resize.observe;
      disconnect = resize.disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return {
        height:
          this.dataset.slot === "product-editor-panel" ? editorHeight : 600,
      } as DOMRect;
    }
  );
  const { unmount } = render(
    <ProductDeskLayout
      archive={<p>Archive</p>}
      editor={<p>Editor</p>}
      preview={<p>Preview</p>}
    />
  );
  const archive = () =>
    screen.getByText("Archive").closest('[data-slot="card"]');
  const column = (name: string) =>
    screen.getByText(name).parentElement?.parentElement;
  expect(archive()?.parentElement).toBe(column("Preview"));
  expect(archive()).toHaveClass("order-3");
  expect(resize.observe).toHaveBeenCalledTimes(2);
  editorHeight = 300;
  act(() => resize.notify());
  expect(archive()?.parentElement).toBe(column("Editor"));
  expect(screen.getAllByText("Archive")).toHaveLength(1);
  unmount();
  expect(resize.disconnect).toHaveBeenCalledOnce();
});
