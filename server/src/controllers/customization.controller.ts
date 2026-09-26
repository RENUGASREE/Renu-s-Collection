import { Request, Response, NextFunction } from "express";
import { customizationService } from "../services/customization.service.js";

export async function getProductCustomization(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId || req.params.id;
    const customization = await customizationService.getProductCustomization(productId);
    res.json({ success: true, data: customization });
  } catch (error) {
    next(error);
  }
}

export async function calculateCustomizationPrice(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId || req.params.id;
    const { selections } = req.body;
    const pricing = await customizationService.calculatePrice(productId, selections);
    res.json({ success: true, data: pricing });
  } catch (error) {
    next(error);
  }
}

export async function validateCustomization(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId || req.params.id;
    const { selections } = req.body;
    const validation = await customizationService.validateCustomization(productId, selections);
    res.json({ success: true, data: validation });
  } catch (error) {
    next(error);
  }
}

export async function getCustomizationPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId || req.params.id;
    const { selections } = req.body;
    const preview = await customizationService.generatePreview(productId, selections);
    res.json({ success: true, data: preview });
  } catch (error) {
    next(error);
  }
}
