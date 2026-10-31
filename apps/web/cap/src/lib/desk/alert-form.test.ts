import { describe, expect, it } from "vitest";
import { gmsCatalogueFixture as catalogue } from "@/test/cap-gms-catalogue.fixture";
import { deskAlert, deskInfo } from "@/test/desk-alert.fixture";
import {
  blockingError,
  buildCreatePayload,
  buildUpdatePayload,
  emptyForm,
  formFromAlert,
} from "./alert-form";

const PATTERN_1 = /Headline/;
const PATTERN_2 = /category/;
const PATTERN_3 = /product/;
const PATTERN_4 = /colour/;

describe("formFromAlert", () => {
  it("reads the product, colour and sectors back from the saved parameters", () => {
    const { form } = formFromAlert(deskAlert(), catalogue);
    expect(form.product).toBe("Warning");
    expect(form.colour).toBe("orange");
    expect(form.sectors).toEqual(["marine"]);
    expect(form.fields.headline).toBe("Heavy Rainfall Warning");
    expect(form.areas).toHaveLength(1);
  });

  it("saving an untouched draft sends the same content back", () => {
    const alert = deskAlert();
    const { carryOver, form } = formFromAlert(alert, catalogue);
    const body = buildUpdatePayload(form, catalogue, carryOver);
    const [info] = body.info ?? [];
    expect(info?.headline).toBe("Heavy Rainfall Warning");
    expect(info?.severity).toBe("Severe");
    expect(info?.parameters).toEqual(
      expect.arrayContaining([
        { value: "Warning", value_name: "GMS:product" },
        { value: "3; orange; Severe", value_name: "awareness_level" },
        { value: "marine", value_name: "GMS:sectors" },
      ])
    );
    expect(info?.areas?.[0]?.geocodes).toEqual([
      { value: "GD-01", value_name: "ISO3166-2:GD" },
    ]);
    expect(info?.expires).toBe("2026-11-02T12:00:00.000Z");
  });

  it("never sends the message type, sender or references, so an Update keeps its reference", () => {
    const alert = deskAlert({
      msg_type: "Update",
      references: [
        {
          id: "r1",
          identifier: "urn:original",
          sender: "meteorology@gaa.gd",
          sent: "2026-10-31T10:00:00Z",
        },
      ] as never,
    });
    const { carryOver, form } = formFromAlert(alert, catalogue);
    const body = buildUpdatePayload(form, catalogue, carryOver);
    expect(body).not.toHaveProperty("msg_type");
    expect(body).not.toHaveProperty("references");
    expect(body).not.toHaveProperty("sender");
    expect(body).not.toHaveProperty("identifier");
  });

  it("carries over parameters, fields and info blocks the form does not show", () => {
    const alert = deskAlert({
      info: [
        deskInfo({
          audience: "Mariners",
          parameters: [
            ...(deskInfo().parameters ?? []),
            { value: "kept", value_name: "partner:extra" },
            { value: "GMS-BUL", value_name: "GMS:source-bulletin-kind" },
          ],
          response_types: ["Prepare"],
        }),
        deskInfo({ headline: "Second block", id: "i2", language: "fr" }),
      ],
    });
    const { carryOver, form } = formFromAlert(alert, catalogue);
    const body = buildUpdatePayload(form, catalogue, carryOver);
    expect(body.info).toHaveLength(2);
    expect(body.info?.[1]?.headline).toBe("Second block");
    expect(body.info?.[0]?.audience).toBe("Mariners");
    expect(body.info?.[0]?.response_types).toEqual(["Prepare"]);
    expect(body.info?.[0]?.parameters).toEqual(
      expect.arrayContaining([
        { value: "kept", value_name: "partner:extra" },
        { value: "GMS-BUL", value_name: "GMS:source-bulletin-kind" },
      ])
    );
  });
});

describe("blockingError and buildCreatePayload", () => {
  it("asks for the message, a category, a product and a colour in turn", () => {
    const form = emptyForm();
    expect(blockingError(form, catalogue)).toMatch(PATTERN_1);
    form.fields = {
      ...form.fields,
      description: "d",
      event: "Heavy Rainfall",
      headline: "h",
    };
    expect(blockingError(form, catalogue)).toMatch(PATTERN_2);
    form.categories = ["Met"];
    expect(blockingError(form, catalogue)).toMatch(PATTERN_3);
    form.product = "Warning";
    expect(blockingError(form, catalogue)).toMatch(PATTERN_4);
    form.colour = "yellow";
    expect(blockingError(form, catalogue)).toBeNull();
  });

  it("a new desk alert is always an Alert", () => {
    const form = emptyForm();
    form.product = "Outlook";
    expect(buildCreatePayload(form, catalogue).msg_type).toBe("Alert");
  });

  it("seeds only the sender's identity from CAP settings", () => {
    const form = emptyForm({
      contact: "desk@gaa.gd",
      sender_name: "GMS",
      web: "https://weather.gd",
    } as never);
    expect(form.fields.contact).toBe("desk@gaa.gd");
    expect(form.fields.headline).toBe("");
    expect(form.fields.description).toBe("");
  });
});
