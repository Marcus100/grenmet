import { z } from "zod";

export const CONTACT_SUBJECTS = [
  "General enquiry",
  "Flight information",
  "Business & commercial",
  "Lost & found",
  "Media",
] as const;

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().email("Please enter a valid email address"),
  subject: z.enum(CONTACT_SUBJECTS),
  message: z.string().trim().min(10, "Please tell us a little more").max(4000),
});

export type ContactInput = z.infer<typeof contactSchema>;
