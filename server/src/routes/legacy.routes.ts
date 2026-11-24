import { Router, Request, Response, NextFunction } from "express";
import { PostgresCategoryRepository } from "../repositories/postgres-category.repository.js";
import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import { PostgresUserRepository } from "../repositories/postgres-user.repository.js";
import * as authService from "../services/auth.service.js";
import { setRefreshCookie } from "../controllers/auth.controller.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateBody } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../validators/auth.validators.js";
import { z } from "zod";

const router = Router();

let categoryRepo = new PostgresCategoryRepository();
let productRepo = new PostgresProductRepository();
let userRepo = new PostgresUserRepository();

export function setLegacyRouteRepositories(repos: {
  categoryRepo?: PostgresCategoryRepository;
  productRepo?: PostgresProductRepository;
  userRepo?: PostgresUserRepository;
}) {
  if (repos.categoryRepo) categoryRepo = repos.categoryRepo;
  if (repos.productRepo) productRepo = repos.productRepo;
  if (repos.userRepo) userRepo = repos.userRepo;
}

function primaryImage(product: { media?: { url: string; isPrimary?: boolean }[]; name: string }) {
  const primary = product.media?.find((m) => m.isPrimary) ?? product.media?.[0];
  return primary?.url ?? "";
}

async function toLegacyProduct(product: any, productType: "bracelet" | "chain") {
  const category = product.categoryId
    ? await categoryRepo.findById(product.categoryId).catch(() => null)
    : null;

  return {
    id: String(product.id || product._id),
    name: product.name,
    description: product.description,
    price: product.price,
    imageUrl: product.imageUrl || primaryImage(product),
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
  const allCategories = await categoryRepo.findAll({ active: true });
  const matchingCategories = allCategories.filter((c) =>
    productTypes.includes(c.productType as any)
  );
  const categoryIds = matchingCategories.map((c) => c.id);

  const allProducts = await productRepo.findAll(
    { isActive: true },
    { limit: 100 }
  );

  let products = allProducts.filter((p: any) =>
    categoryIds.includes(p.categoryId)
  );

  if (req.query.is_signature_piece === "true") {
    products = products.filter((p: any) => p.isSignaturePiece === true);
  }

  const legacyType = productTypes.includes("bracelet") ? "bracelet" : "chain";
  return Promise.all(products.map((p: any) => toLegacyProduct(p, legacyType)));
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
    const product = await productRepo.findById(req.params.id);
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
    const product = await productRepo.findById(req.params.id);
    if (!product) throw new AppError("Not found", 404);
    res.json(await toLegacyProduct(product, "chain"));
  } catch (error) {
    next(error);
  }
});

router.get("/categories", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await categoryRepo.findAll({ active: true });
    res.json(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        parent: c.parentId ?? null,
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
      const user = await userRepo.findByUsername(req.body.username);
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
