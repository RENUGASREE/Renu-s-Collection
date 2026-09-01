import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service.js";
import * as userService from "../services/user.service.js";
import { WishlistItem } from "../models/Wishlist.js";
import { Product } from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";

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
    const items = await WishlistItem.find({ userId: req.user!.id })
      .populate('productId')
      .lean();

    const wishlistItems = items.map(item => ({
      id: item._id.toString(),
      productId: item.productId._id.toString(),
      product: item.productId,
      createdAt: item.createdAt,
    }));

    // Also return just the product IDs for easy checking
    const productIds = items.map(item => item.productId._id.toString());

    res.json({ success: true, data: { items: wishlistItems, productIds } });
  } catch (error) {
    next(error);
  }
}

export async function addToWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError("Product not found", 404);
    }

    const item = await WishlistItem.findOneAndUpdate(
      { userId: req.user!.id, productId },
      { userId: req.user!.id, productId },
      { upsert: true, new: true }
    );

    res.json({ success: true, data: { id: item._id.toString(), productId } });
  } catch (error) {
    next(error);
  }
}

export async function removeFromWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    // Support removal by wishlist item ID or by productId
    const { productId } = req.body;

    if (productId) {
      await WishlistItem.findOneAndDelete({
        userId: req.user!.id,
        productId,
      });
    } else {
      await WishlistItem.findOneAndDelete({
        _id: req.params.id,
        userId: req.user!.id,
      });
    }

    res.json({ success: true, message: "Item removed from wishlist" });
  } catch (error) {
    next(error);
  }
}
