import { z } from "zod";

/** Elements a requester can ask for. Values match the FastAPI enum. */
export const DATA_PARAMETERS = [
  { value: "rainfall", label: "Rainfall" },
  { value: "temperature", label: "Temperature" },
  { value: "wind", label: "Wind" },
  { value: "humidity", label: "Humidity" },
  { value: "pressure", label: "Pressure" },
  { value: "other", label: "Other (describe in the purpose)" },
] as const;

export const DATA_FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "excel", label: "Excel" },
  { value: "pdf", label: "PDF" },
] as const;

export const INTENDED_USES = [
  { value: "student", label: "Student or school project" },
  { value: "academic", label: "Academic research" },
  { value: "commercial", label: "Commercial, engineering or insurance" },
  { value: "government", label: "Government or public body" },
  { value: "other", label: "Other" },
] as const;

const values = <T extends readonly { value: string }[]>(items: T) =>
  items.map((item) => item.value) as [T[number]["value"]];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Enter a valid date.");

export const dataRequestSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(120),
    email: z.string().trim().email("Enter a valid email address.").max(254),
    organisation: z.string().trim().min(1, "Enter your organisation.").max(200),
    purpose: z
      .string()
      .trim()
      .min(10, "Tell us a little more about the purpose.")
      .max(2000),
    parameters: z
      .array(z.enum(values(DATA_PARAMETERS)))
      .min(1, "Choose at least one element."),
    stations: z.string().trim().min(2, "Enter a station or area.").max(500),
    periodStart: isoDate,
    periodEnd: isoDate,
    dataFormat: z.enum(values(DATA_FORMATS)),
    intendedUse: z.enum(values(INTENDED_USES)),
    consent: z.literal(true, "Please agree to the conditions of use."),
    // Honeypot: people never see this field; bots fill it.
    website: z.string().max(200).optional(),
    // Cloudflare Turnstile token; FastAPI verifies it.
    turnstileToken: z.string().max(2048).optional(),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "The end date must not be before the start date.",
    path: ["periodEnd"],
  });

export type DataRequestInput = z.infer<typeof dataRequestSchema>;
