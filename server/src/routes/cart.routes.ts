import { Router, Request, Response, NextFunction } from "express";
import * as cartService from "../services/cart.service.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// Get cart items
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    const items = await cartService.getCartItems(userId);
    return res.json({ success: true, data: items });
  } catch (error) {
    next(error);
    return;
  }
});

// Add item to cart
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    const result = await cartService.addCartItem(userId, req.body);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
    return;
  }
});

// Update cart item quantity
router.patch("/:itemId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    const { itemId } = req.params;
    const { quantity, customization } = req.body;
    
    const result = await cartService.updateCartItemQuantity(userId, itemId, quantity, customization);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
    return;
  }
});

// Remove item from cart
router.delete("/:itemId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    const { itemId } = req.params;
    const result = await cartService.removeCartItem(userId, itemId);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
    return;
  }
});

// Clear cart
router.delete("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    await cartService.clearCart(userId);
    return res.json({ success: true, message: "Cart cleared" });
  } catch (error) {
    next(error);
    return;
  }
});

export default router;
