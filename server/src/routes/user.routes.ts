import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { changePasswordSchema, updateProfileSchema } from "../validators/auth.validators.js";

const router = Router();

router.use(requireAuth);

router.get("/me", userController.getProfile);
router.patch("/me", validateBody(updateProfileSchema), userController.updateProfile);
router.post("/change-password", validateBody(changePasswordSchema), userController.changePassword);

// Wishlist routes
router.get("/wishlist", userController.getWishlist);
router.post("/wishlist", userController.addToWishlist);
router.delete("/wishlist/:id", userController.removeFromWishlist);
router.post("/wishlist/remove", userController.removeFromWishlist);

export default router;
