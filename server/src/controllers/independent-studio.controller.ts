import { Request, Response, NextFunction } from "express";
import { independentStudioService } from "../services/independent-studio.service.js";

// ============================================================================
// CATEGORIES
// ============================================================================

export const getStudioCategoriesTree = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const onlyPublished = req.query.published === "true";
    const tree = await independentStudioService.getCategoriesTree(onlyPublished);
    res.json({ success: true, data: tree });
  } catch (err) {
    next(err);
  }
};

export const getStudioCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const onlyPublished = req.query.published === "true";
    const onlyActive = req.query.active !== "false";
    const categories = await independentStudioService.getAllCategories({ onlyPublished, onlyActive });
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
};

export const getStudioCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const category = await independentStudioService.getCategoryById(id);
    if (!category) {
      res.status(404).json({ success: false, message: "Studio category not found" });
      return;
    }
    res.json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
};

export const createStudioCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = await independentStudioService.createCategory(req.body);
    res.status(201).json({ success: true, data: category, message: "Studio category created successfully" });
  } catch (err) {
    next(err);
  }
};

export const updateStudioCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const category = await independentStudioService.updateCategory(id, req.body);
    res.json({ success: true, data: category, message: "Studio category updated successfully" });
  } catch (err) {
    next(err);
  }
};

export const deleteStudioCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    await independentStudioService.deleteCategory(id);
    res.json({ success: true, message: "Studio category deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// CONSTRUCTION METHODS
// ============================================================================

export const getConstructionMethods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const onlyPublished = req.query.published === "true";
    const onlyActive = req.query.active !== "false";
    const methods = await independentStudioService.getAllMethods({ onlyPublished, onlyActive });
    res.json({ success: true, data: methods });
  } catch (err) {
    next(err);
  }
};

export const getMethodsForSubcategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { subcategoryId } = req.params;
    const onlyPublished = req.query.published !== "false";
    const methods = await independentStudioService.getMethodsForSubcategory(subcategoryId, onlyPublished);
    res.json({ success: true, data: methods });
  } catch (err) {
    next(err);
  }
};

export const getConstructionMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const method = await independentStudioService.getMethodById(id);
    if (!method) {
      res.status(404).json({ success: false, message: "Construction method not found" });
      return;
    }
    res.json({ success: true, data: method });
  } catch (err) {
    next(err);
  }
};

export const createConstructionMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const method = await independentStudioService.createMethod(req.body);
    res.status(201).json({ success: true, data: method, message: "Construction method created successfully" });
  } catch (err) {
    next(err);
  }
};

export const updateConstructionMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const method = await independentStudioService.updateMethod(id, req.body);
    res.json({ success: true, data: method, message: "Construction method updated successfully" });
  } catch (err) {
    next(err);
  }
};

export const deleteConstructionMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    await independentStudioService.deleteMethod(id);
    res.json({ success: true, message: "Construction method deleted successfully" });
  } catch (err) {
    next(err);
  }
};

export const assignMethodToSubcategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { subcategoryId, methodId } = req.params;
    const isPublished = req.body.isPublished ?? true;
    await independentStudioService.assignMethodToSubcategory(subcategoryId, methodId, isPublished);
    res.json({ success: true, message: "Method assigned to subcategory successfully" });
  } catch (err) {
    next(err);
  }
};

export const removeMethodFromSubcategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { subcategoryId, methodId } = req.params;
    await independentStudioService.removeMethodFromSubcategory(subcategoryId, methodId);
    res.json({ success: true, message: "Method removed from subcategory successfully" });
  } catch (err) {
    next(err);
  }
};

export const getSubcategoriesForMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { methodId } = req.params;
    const data = await independentStudioService.getSubcategoriesForMethod(methodId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const syncMethodSubcategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { methodId } = req.params;
    const { subcategoryIds } = req.body;
    if (!Array.isArray(subcategoryIds)) {
      res.status(400).json({ success: false, message: "subcategoryIds must be an array of strings" });
      return;
    }
    await independentStudioService.syncSubcategoriesForMethod(methodId, subcategoryIds);
    res.json({
      success: true,
      data: {
        constructionMethodId: methodId,
        subcategoryIds,
      },
      message: "Subcategories synchronized successfully",
    });
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// DESIGN RULES
// ============================================================================

export const getDesignRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const constructionMethodId = req.query.constructionMethodId as string | undefined;
    const onlyPublished = req.query.published === "true";
    const onlyActive = req.query.active !== "false";

    const rules = await independentStudioService.getAllDesignRules({
      categoryId,
      constructionMethodId,
      onlyPublished,
      onlyActive,
    });
    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
};

export const getDesignRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const rule = await independentStudioService.getDesignRuleById(id);
    if (!rule) {
      res.status(404).json({ success: false, message: "Studio design rule not found" });
      return;
    }
    res.json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
};

export const createDesignRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rule = await independentStudioService.createDesignRule(req.body);
    res.status(201).json({ success: true, data: rule, message: "Studio design rule created successfully" });
  } catch (err) {
    next(err);
  }
};

export const updateDesignRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const rule = await independentStudioService.updateDesignRule(id, req.body);
    res.json({ success: true, data: rule, message: "Studio design rule updated successfully" });
  } catch (err) {
    next(err);
  }
};

export const duplicateDesignRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const newName = req.body.name as string | undefined;
    const duplicated = await independentStudioService.duplicateDesignRule(id, newName);
    res.status(201).json({ success: true, data: duplicated, message: "Rule duplicated successfully" });
  } catch (err) {
    next(err);
  }
};

export const deleteDesignRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    await independentStudioService.deleteDesignRule(id);
    res.json({ success: true, message: "Studio design rule deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// VISUAL ASSEMBLY STRUCTURES
// ============================================================================

export const getAssemblyStructure = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { methodId } = req.params;
    const subcategoryId = req.query.subcategoryId as string | undefined;
    const structure = await independentStudioService.getAssemblyStructure(methodId, subcategoryId);
    res.json({ success: true, data: structure });
  } catch (err) {
    next(err);
  }
};

export const saveAssemblyStructure = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const structure = await independentStudioService.saveAssemblyStructure(req.body);
    res.json({ success: true, data: structure, message: "Visual assembly structure saved successfully" });
  } catch (err) {
    next(err);
  }
};

export const deleteAssemblyStructure = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    await independentStudioService.deleteAssemblyStructure(id);
    res.json({ success: true, message: "Visual assembly structure deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// MATERIAL LINKS
// ============================================================================

export const getMaterialLinks = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const links = await independentStudioService.getAllMaterialLinks();
    res.json({ success: true, data: links });
  } catch (err) {
    next(err);
  }
};

export const createMaterialLink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const link = await independentStudioService.createMaterialLink(req.body);
    res.status(201).json({ success: true, data: link, message: "Material link established successfully" });
  } catch (err) {
    next(err);
  }
};

export const updateMaterialLink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const link = await independentStudioService.updateMaterialLink(id, req.body);
    res.json({ success: true, data: link, message: "Material link updated successfully" });
  } catch (err) {
    next(err);
  }
};

export const deleteMaterialLink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    await independentStudioService.deleteMaterialLink(id);
    res.json({ success: true, message: "Material link removed successfully (materials preserved)" });
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// PHYSICAL CALIBRATION PROBE
// ============================================================================

export const checkPhysicalFit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { specs, components } = req.body;
    const result = independentStudioService.calculatePhysicalFit(specs || {}, components || []);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
