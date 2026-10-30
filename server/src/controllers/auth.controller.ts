import { Response, NextFunction, Request } from "express";
import jwt from "jsonwebtoken";
import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";

const REFRESH_COOKIE = "reyan_refresh_token";

function getCookieOptions(res: Response) {
  const req = (res as any).req as Request | undefined;
  const isSecure = Boolean(
    env.isProduction ||
    req?.secure ||
    req?.headers?.["x-forwarded-proto"] === "https"
  );

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: (isSecure ? "none" : "lax") as "none" | "lax",
    path: "/",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  const opts = getCookieOptions(res);
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...opts,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  const opts = getCookieOptions(res);
  res.clearCookie(REFRESH_COOKIE, opts);
}

function sendAuthResponse(res: Response, result: authService.AuthTokensResponse, status = 200) {
  setRefreshCookie(res, result.refreshToken);
  res.status(status).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.registerUser(req.body);
    sendAuthResponse(res, result, 201);
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    sendAuthResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function googleLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.loginWithGoogle(req.body.idToken);
    sendAuthResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE] ||
      req.body?.refreshToken ||
      (req.headers["x-refresh-token"] as string | undefined);

    if (!refreshToken) {
      res.status(401).json({ success: false, message: "Refresh token missing" });
      return;
    }
    const result = await authService.refreshSession(refreshToken);
    sendAuthResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.id) {
      await authService.logoutUser(req.user.id);
    } else {
      const refreshToken =
        req.cookies?.[REFRESH_COOKIE] ||
        req.body?.refreshToken ||
        (req.headers["x-refresh-token"] as string | undefined);

      if (refreshToken) {
        try {
          const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string };
          if (payload?.sub) {
            await authService.logoutUser(payload.sub);
          }
        } catch {
          // Token expired or invalid, continue clearing cookie
        }
      }
    }
    clearRefreshCookie(res);
    res.json({ success: true, message: "Logged out" });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getUserById(req.user!.id);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.forgotPassword(req.body.email);
    res.json({
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ success: true, message: "Password reset successful" });
  } catch (error) {
    next(error);
  }
}

export { REFRESH_COOKIE };
