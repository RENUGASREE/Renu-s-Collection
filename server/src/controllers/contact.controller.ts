import { Request, Response, NextFunction } from "express";
import { ContactMessage } from "../models/ContactMessage.js";
import { sendEmail, isEmailConfigured } from "../utils/email.js";
import { env } from "../config/env.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function submitContactMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, email, subject, message } = req.body;

    const emailConfigured = isEmailConfigured();

    // 1. Persist the message in MongoDB first so it is never lost
    const submission = await ContactMessage.create({
      name,
      email,
      subject,
      message,
      status: "new",
      emailNotification: {
        status: emailConfigured ? "not_configured" : "not_configured",
      },
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get("user-agent"),
    });

    let emailDelivered = false;

    // 2. If SMTP is configured, attempt email delivery
    if (emailConfigured) {
      const targetEmail = env.CONTACT_NOTIFICATION_EMAIL || "renuscollection05@gmail.com";
      const emailResult = await sendEmail({
        to: targetEmail,
        subject: `[Contact Form] ${subject} - from ${name}`,
        replyTo: email,
        text: `New contact form submission received on Renu's Collections:\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}\n\nSubmission ID: ${submission._id}\nTime: ${new Date().toISOString()}`,
        html: `
          <h3>New Contact Form Submission</h3>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
          <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
          <hr />
          <p style="font-size: 12px; color: #777;">Submission ID: ${submission._id} | Time: ${new Date().toISOString()}</p>
        `,
      });

      if (emailResult.delivered) {
        emailDelivered = true;
        submission.emailNotification = {
          status: "sent",
          attemptedAt: new Date(),
        };
        await submission.save();
      } else {
        submission.emailNotification = {
          status: "failed",
          attemptedAt: new Date(),
          error: emailResult.error || "Delivery failed",
        };
        await submission.save();
      }
    }

    // 3. Construct a truthful response based on actual email delivery state
    let responseMessage: string;
    if (emailDelivered) {
      responseMessage =
        "Thank you! Your message has been received and forwarded to our team at renuscollection05@gmail.com.";
    } else if (emailConfigured) {
      responseMessage =
        "Thank you! Your message has been safely received. Email notification delivery is currently undergoing verification.";
    } else {
      responseMessage =
        "Thank you! Your message has been received and saved. Note: Email notifications are not yet configured on this server.";
    }

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: {
        id: submission._id,
        saved: true,
        emailDelivered,
        emailConfigured,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin-only listing of contact submissions with pagination
 */
export async function listContactMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      ContactMessage.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ContactMessage.countDocuments({}),
    ]);

    res.json({
      success: true,
      data: messages,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}
