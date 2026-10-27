import { z } from "zod";

export const contactSubmissionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .transform((val) => val.replace(/<[^>]*>?/gm, "").trim()),
  email: z
    .string()
    .trim()
    .email("Please provide a valid email address")
    .max(255, "Email cannot exceed 255 characters")
    .toLowerCase(),
  subject: z
    .string()
    .trim()
    .min(2, "Subject must be at least 2 characters")
    .max(200, "Subject cannot exceed 200 characters")
    .transform((val) => val.replace(/<[^>]*>?/gm, "").trim()),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message cannot exceed 5000 characters")
    .transform((val) => val.replace(/<[^>]*>?/gm, "").trim()),
});

export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;
