"use client";
import { FieldLabel, useField } from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";
import { useEffect, useState } from "react";

interface Option {
  id: string;
  kind: string;
  label: string;
}

const PRODUCT_ID = /productId$/;

type Load =
  | { state: "loading" }
  | { state: "ready"; products: Option[] }
  | { state: "unavailable" };

/**
 * Pick a current FastAPI product for a post. Saves only its id and kind; a
 * product linked earlier that is no longer current stays selected.
 */
export const ProductPicker: TextFieldClientComponent = ({ field, path }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({
    path,
  });
  const kindPath = path.replace(PRODUCT_ID, "kind");
  const { setValue: setKind } = useField<string>({ path: kindPath });
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/linked-products", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((body: { products: Option[] }) =>
        setLoad({ state: "ready", products: body.products })
      )
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "unavailable" });
      });
    return () => controller.abort();
  }, []);

  const products = load.state === "ready" ? load.products : [];
  const listed = products.some((product) => product.id === value);
  const inputId = `field-${path.replaceAll(".", "__")}`;

  return (
    <div className="field-type text">
      <FieldLabel
        htmlFor={inputId}
        label={field.label || "Product"}
        required={field.required}
      />
      <select
        disabled={load.state === "loading"}
        id={inputId}
        onChange={(event) => {
          const chosen = products.find(
            (product) => product.id === event.target.value
          );
          setValue(chosen?.id ?? "");
          setKind(chosen?.kind ?? "");
        }}
        value={value ?? ""}
      >
        <option value="">
          {load.state === "loading" ? "Loading products…" : "No product"}
        </option>
        {value && !listed && (
          <option value={value}>Linked earlier (no longer current)</option>
        )}
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.label}
          </option>
        ))}
      </select>
      {load.state === "unavailable" && (
        <p role="status">
          Weather products can't be loaded right now. Any product already linked
          is kept.
        </p>
      )}
      {showError && errorMessage && <p role="alert">{errorMessage}</p>}
    </div>
  );
};
