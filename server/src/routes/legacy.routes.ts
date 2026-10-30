import { Router, Request, Response, NextFunction } from "express";
import { Category, Product } from "../models/index.js";
import * as authService from "../services/auth.service.js";
import { setRefreshCookie } from "../controllers/auth.controller.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateBody } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../validators/auth.validators.js";
import { z } from "zod";

const router = Router();

function primaryImage(product: { media?: { url: string; isPrimary?: boolean }[]; name: string }) {
  const primary = product.media?.find((m) => m.isPrimary) ?? product.media?.[0];
  return primary?.url ?? "";
}

async function toLegacyProduct(product: Record<string, unknown>, productType: "bracelet" | "chain") {
  const category = product.categoryId
    ? await Category.findById(product.categoryId as string).lean()
    : null;

  return {
    id: (product._id as { toString(): string }).toString(),
    name: product.name,
    description: product.description,
    price: product.price,
    imageUrl: primaryImage(product as { media?: { url: string; isPrimary?: boolean }[]; name: string }),
    created_at: product.createdAt,
    updated_at: product.updatedAt,
    category: productType === "bracelet" ? "Bracelet" : "Chain",
    badge: product.badge ?? "",
    is_signature_piece: product.isSignaturePiece ?? false,
    signature_category: product.signatureCategory ?? "none",
    category_slug: category?.slug ?? null,
    category_name: category?.name ?? null,
    stock_quantity: product.stock ?? 0,
    is_active: product.isActive ?? true,
    sku: product.sku,
    is_in_stock: (product.stock as number) > 0,
  };
}

async function listLegacyProducts(productTypes: ("bracelet" | "earring" | "bangle")[], req: Request) {
  const categories = await Category.find({ productType: { $in: productTypes }, isActive: true }).lean();
  const categoryIds = categories.map((c) => c._id);

  const filter: Record<string, unknown> = {
    isActive: true,
    categoryId: { $in: categoryIds },
  };

  if (req.query.is_signature_piece === "true") {
    filter.isSignaturePiece = true;
  }

  const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
  const legacyType = productTypes.includes("bracelet") ? "bracelet" : "chain";
  return Promise.all(products.map((p) => toLegacyProduct(p, legacyType)));
}

router.get("/bracelets", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listLegacyProducts(["bracelet"], req);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/bracelets/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw new AppError("Not found", 404);
    res.json(await toLegacyProduct(product, "bracelet"));
  } catch (error) {
    next(error);
  }
});

router.get("/chains", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listLegacyProducts(["earring", "bangle"], req);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/chains/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw new AppError("Not found", 404);
    res.json(await toLegacyProduct(product, "chain"));
  } catch (error) {
    next(error);
  }
});

router.get("/categories", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    res.json(
      categories.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        slug: c.slug,
        parent: c.parentId?.toString() ?? null,
        group: c.productType === "bracelet" ? "bracelet" : "chain",
        is_active: c.isActive,
        position: c.sortOrder,
        show_in_menu: c.showInMenu,
      }))
    );
  } catch (error) {
    next(error);
  }
});

const legacyLoginSchema = loginSchema.extend({
  username: z.string().optional(),
});

router.post("/login", validateBody(legacyLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let email = req.body.email as string | undefined;
    if (!email && req.body.username) {
      const { User } = await import("../models/User.js");
      const user = await User.findOne({ username: req.body.username });
      if (!user) throw new AppError("Invalid email or password", 401);
      email = user.email;
    }
    if (!email) throw new AppError("Email or username is required", 400);

    const result = await authService.loginUser(email, req.body.password);
    setRefreshCookie(res, result.refreshToken);
    res.json({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      user_id: result.user.id,
      email: result.user.email,
      username: result.user.username,
      role: result.user.role,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/register", validateBody(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.registerUser(req.body);
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      user_id: result.user.id,
      email: result.user.email,
      username: result.user.username,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/send-otp", (_req: Request, res: Response) => {
  res.json({ message: "Use /api/v1/auth/forgot-password for password reset links." });
});

router.post("/verify-otp", (_req: Request, res: Response) => {
  res.status(400).json({ error: "OTP flow replaced. Use the link sent to your email." });
});

router.post("/reset-password", (_req: Request, res: Response) => {
  res.status(400).json({ error: "Use /api/v1/auth/reset-password with your reset token." });
});

export default router;
