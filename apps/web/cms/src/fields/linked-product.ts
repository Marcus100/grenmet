import type { Field } from "payload";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A pointer to one FastAPI weather product. Only the id and kind are stored;
 * the site loads the product's figures from FastAPI when it renders, so a post
 * can never carry a mistyped or stale number.
 */
export function linkedProductField({
  required = false,
  description,
}: {
  description: string;
  required?: boolean;
}): Field {
  return {
    name: "linkedProduct",
    type: "group",
    label: "Weather product",
    admin: { description },
    fields: [
      {
        name: "productId",
        type: "text",
        required,
        label: "Product",
        validate: (value: unknown) => {
          if (value === null || value === undefined || value === "")
            return required ? "Choose the weather product." : true;
          return typeof value === "string" && UUID.test(value)
            ? true
            : "Choose a product from the list.";
        },
        admin: {
          components: { Field: "/components/product-picker#ProductPicker" },
        },
      },
      {
        name: "kind",
        type: "text",
        admin: { hidden: true },
      },
    ],
  };
}
