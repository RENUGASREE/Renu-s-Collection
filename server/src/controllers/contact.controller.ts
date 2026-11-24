import { Request, Response, NextFunction } from "express";
import {
  IContactRepository,
  PostgresContactRepository,
} from "../repositories/postgres-contact.repository.js";
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

export class ContactController {
  private contactRepo: IContactRepository;

  constructor(contactRepo?: IContactRepository) {
    this.contactRepo = contactRepo || new PostgresContactRepository();
  }

  public submitMessage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { name, email, subject, message } = req.body;

      const emailConfigured = isEmailConfigured();

      // 1. Persist message in PostgreSQL contact_messages table first so it is never lost
      const submission = await this.contactRepo.createMessage({
        name,
        email,
        subject,
        message,
        status: "new",
        email_notification_status: "not_configured",
        ip_address: req.ip || req.socket.remoteAddress,
        user_agent: req.get("user-agent"),
      });

      let emailDelivered = false;

      // 2. If SMTP is configured, attempt email delivery
      if (emailConfigured) {
        const targetEmail = env.CONTACT_NOTIFICATION_EMAIL || "renuscollection05@gmail.com";
        const emailResult = await sendEmail({
          to: targetEmail,
          subject: `[Contact Form] ${subject} - from ${name}`,
          replyTo: email,
          text: `New contact form submission received on Renu's Collections:\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}\n\nSubmission ID: ${submission.id}\nTime: ${new Date().toISOString()}`,
          html: `
            <h3>New Contact Form Submission</h3>
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
            <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
            <hr />
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
            <hr />
            <p style="font-size: 12px; color: #777;">Submission ID: ${submission.id} | Time: ${new Date().toISOString()}</p>
          `,
        });

        if (emailResult.delivered) {
          emailDelivered = true;
          await this.contactRepo.updateEmailNotification(submission.id, {
            status: "sent",
            attemptedAt: new Date(),
          });
        } else {
          await this.contactRepo.updateEmailNotification(submission.id, {
            status: "failed",
            attemptedAt: new Date(),
            error: emailResult.error || "Delivery failed",
          });
        }
      }

      // 3. Construct response based on email delivery state
      let responseMessage: string;
      if (emailDelivered) {
        responseMessage =
          "Thank you! Your message has been received and forwarded to our team at renuscollection05@gmail.com.";
      } else if (emailConfigured) {
        responseMessage =
          "Thank you! Your message has been safely saved in our database. Note: The mail server could not forward an email notification at this time.";
      } else {
        responseMessage =
          "Thank you! Your message has been received and saved. Note: Email notifications are not yet configured on this server.";
      }

      res.status(201).json({
        success: true,
        message: responseMessage,
        data: {
          id: submission.id,
          saved: true,
          emailDelivered,
          emailConfigured,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public listMessages = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

      const { messages, total } = await this.contactRepo.findAll({ page, limit });

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
  };
}

let defaultContactController: ContactController | null = null;
function getDefaultContactController(): ContactController {
  if (!defaultContactController) {
    defaultContactController = new ContactController();
  }
  return defaultContactController;
}

export const submitContactMessage = (req: Request, res: Response, next: NextFunction) =>
  getDefaultContactController().submitMessage(req, res, next);

export const listContactMessages = (req: Request, res: Response, next: NextFunction) =>
  getDefaultContactController().listMessages(req, res, next);
