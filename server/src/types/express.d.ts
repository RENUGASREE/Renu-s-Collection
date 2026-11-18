import { UserRole } from "./index.js";

declare global {
  namespace Express {
    interface UserPayload {
      id: string;
      email: string;
      role: UserRole;
    }

    interface Request {
      user?: UserPayload;
      rawBody?: Buffer;
    }
  }
}

export {};
