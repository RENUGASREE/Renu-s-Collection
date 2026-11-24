import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service.js";
import * as userService from "../services/user.service.js";
import * as wishlistService from "../services/wishlist.service.js";

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await authService.getUserById(req.user!.id);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await userService.updateProfile(req.user!.id, req.body);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body;
    await userService.changePassword(req.user!.id, currentPassword, newPassword);
    res.json({ success: true, message: "Password updated" });
  } catch (error) {
    next(error);
  }
}

export async function getWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await wishlistService.getWishlist(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function addToWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.body;
    const item = await wishlistService.addToWishlist(req.user!.id, productId);
    res.json({ success: true, data: { id: item.id, productId } });
  } catch (error) {
    next(error);
  }
}

export async function removeFromWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.body;
    await wishlistService.removeFromWishlist(req.user!.id, {
      productId,
      itemId: req.params.id,
    });
    res.json({ success: true, message: "Item removed from wishlist" });
  } catch (error) {
    next(error);
  }
}

