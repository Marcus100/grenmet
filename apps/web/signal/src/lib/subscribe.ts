import { z } from "zod";

export const subscribeSchema = z.object({
  email: z.email("Please enter a valid email address."),
  whatsapp: z
    .string()
    .trim()
    .min(5, "Please enter a valid WhatsApp number.")
    .optional(),
});

export type SubscribePayload = z.infer<typeof subscribeSchema>;

export function parseSubscription(input: unknown) {
  return subscribeSchema.safeParse(input);
}
