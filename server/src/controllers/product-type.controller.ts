/**
 * ============================================================================
 * Product Type Controller
 * ============================================================================
 */

import { Request, Response, NextFunction } from "express";
import * as productTypeService from "../services/product-type.service.js";
import { postgresProductTypeRepository } from "../repositories/postgres-product-type.repository.js";

export async function listProductTypes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const activeOnly = req.query.all !== "true";
    const data = await productTypeService.listProductTypes({ activeOnly });
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function listProductTypesAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const types = await productTypeService.listProductTypes({ activeOnly: false });
    
    // Attach usage count for each product type
    const enriched = await Promise.all(
      types.map(async (t) => {
        const usageCount = await postgresProductTypeRepository.countCategoriesUsingSlug(t.slug);
        return {
          ...t,
          categoryCount: usageCount,
          isInUse: usageCount > 0,
        };
      })
    );

    res.json({
      success: true,
      data: enriched,
    });
  } catch (error) {
    next(error);
  }
}

export async function getProductType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const data = await productTypeService.getProductTypeById(id);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createProductType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const created = await productTypeService.createProductType(req.body);
    res.status(201).json({
      success: true,
      data: created,
      message: `Product type "${created.name}" created successfully.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProductType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const updated = await productTypeService.updateProductType(id, req.body);
    res.json({
      success: true,
      data: updated,
      message: `Product type "${updated.name}" updated successfully.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteProductType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const result = await productTypeService.deleteProductType(id);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}
