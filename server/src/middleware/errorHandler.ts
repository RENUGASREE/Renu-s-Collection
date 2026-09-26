import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";

export class AppError extends Error {
  statusCode: number;
  errors?: Record<string, string[]>;

  constructor(message: string, statusCode = 500, errors?: Record<string, string[]>) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = "AppError";
  }
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError("Resource not found", 404));
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "body";
      if (!errors[key]) errors[key] = [];
      errors[key].push(issue.message);
    }
    res.status(400).json({ success: false, message: "Validation failed", errors });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const errors: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(err.errors)) {
      errors[key] = [val.message];
    }
    res.status(400).json({ success: false, message: "Validation failed", errors });
    return;
  }

  if ((err as { code?: number }).code === 11000) {
    res.status(409).json({ success: false, message: "Duplicate entry" });
    return;
  }

  if ((err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({
      success: false,
      message: "Uploaded payload is too large. Image attachments are limited to 1MB or require external cloud storage.",
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}
