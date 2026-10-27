import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  submitContactMessage,
  listContactMessages,
} from "../controllers/contact.controller.js";
import { validateBody } from "../middleware/validate.js";
import { contactSubmissionSchema } from "../validators/contact.validators.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Dedicated rate limiter for contact form to prevent spam and duplicate bursts
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 contact submissions per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many contact requests from this address. Please wait a few minutes before trying again.",
  },
});

router.post("/", contactLimiter, validateBody(contactSubmissionSchema), submitContactMessage);
router.get("/", requireAuth, requireAdmin, listContactMessages);

export default router;
