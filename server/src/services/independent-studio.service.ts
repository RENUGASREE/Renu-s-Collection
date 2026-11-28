import { postgresStudioCategoryRepository } from "../repositories/postgres-studio-category.repository.js";
import { postgresConstructionMethodRepository } from "../repositories/postgres-construction-method.repository.js";
import { postgresStudioDesignRuleRepository } from "../repositories/postgres-studio-design-rule.repository.js";
import { postgresStudioAssemblyRepository } from "../repositories/postgres-studio-assembly.repository.js";
import { postgresMaterialLinkRepository } from "../repositories/postgres-material-link.repository.js";
import {
  IStudioCategory,
  IStudioConstructionMethod,
  IStudioDesignRule,
  IStudioAssemblyStructure,
  IStudioMaterialLink,
  PhysicalSpecsConfig,
} from "../types/studio.types.js";

export class IndependentStudioService {
  // ==========================================================================
  // CATEGORIES & SUBCATEGORIES
  // ==========================================================================
  async getCategoriesTree(onlyPublished = false): Promise<IStudioCategory[]> {
    return postgresStudioCategoryRepository.findTree({ onlyPublished });
  }

  async getAllCategories(options?: { onlyPublished?: boolean; onlyActive?: boolean }): Promise<IStudioCategory[]> {
    return postgresStudioCategoryRepository.findAll(options);
  }

  async getCategoryById(id: string): Promise<IStudioCategory | null> {
    return postgresStudioCategoryRepository.findById(id);
  }

  async createCategory(data: Partial<IStudioCategory>): Promise<IStudioCategory> {
    return postgresStudioCategoryRepository.create(data);
  }

  async updateCategory(id: string, data: Partial<IStudioCategory>): Promise<IStudioCategory> {
    return postgresStudioCategoryRepository.update(id, data);
  }

  async deleteCategory(id: string): Promise<boolean> {
    return postgresStudioCategoryRepository.delete(id);
  }

  // ==========================================================================
  // CONSTRUCTION METHODS
  // ==========================================================================
  async getAllMethods(options?: { onlyPublished?: boolean; onlyActive?: boolean }): Promise<IStudioConstructionMethod[]> {
    return postgresConstructionMethodRepository.findAll(options);
  }

  async getMethodsForSubcategory(subcategoryId: string, onlyPublished = true): Promise<IStudioConstructionMethod[]> {
    return postgresConstructionMethodRepository.findBySubcategory(subcategoryId, onlyPublished);
  }

  async getMethodById(id: string): Promise<IStudioConstructionMethod | null> {
    return postgresConstructionMethodRepository.findById(id);
  }

  async createMethod(data: Partial<IStudioConstructionMethod>): Promise<IStudioConstructionMethod> {
    return postgresConstructionMethodRepository.create(data);
  }

  async updateMethod(id: string, data: Partial<IStudioConstructionMethod>): Promise<IStudioConstructionMethod> {
    return postgresConstructionMethodRepository.update(id, data);
  }

  async deleteMethod(id: string): Promise<boolean> {
    return postgresConstructionMethodRepository.delete(id);
  }

  async assignMethodToSubcategory(subcategoryId: string, methodId: string, isPublished = true): Promise<void> {
    return postgresConstructionMethodRepository.assignToSubcategory(subcategoryId, methodId, isPublished);
  }

  async removeMethodFromSubcategory(subcategoryId: string, methodId: string): Promise<void> {
    return postgresConstructionMethodRepository.removeFromSubcategory(subcategoryId, methodId);
  }

  async getSubcategoriesForMethod(methodId: string): Promise<{
    constructionMethodId: string;
    subcategoryIds: string[];
    links: Array<{
      subcategoryId: string;
      name: string;
      slug: string;
      parentId?: string | null;
      parentName?: string | null;
      isPublished: boolean;
      displayOrder: number;
    }>;
  }> {
    const [subcategoryIds, links] = await Promise.all([
      postgresConstructionMethodRepository.getSubcategoryIds(methodId),
      postgresConstructionMethodRepository.getSubcategoryLinks(methodId),
    ]);
    return {
      constructionMethodId: methodId,
      subcategoryIds,
      links,
    };
  }

  async syncSubcategoriesForMethod(methodId: string, subcategoryIds: string[]): Promise<void> {
    return postgresConstructionMethodRepository.syncSubcategories(methodId, subcategoryIds);
  }

  // ==========================================================================
  // DESIGN RULES
  // ==========================================================================
  async getAllDesignRules(filter?: {
    categoryId?: string;
    constructionMethodId?: string;
    onlyPublished?: boolean;
    onlyActive?: boolean;
  }): Promise<IStudioDesignRule[]> {
    return postgresStudioDesignRuleRepository.findAll(filter);
  }

  async getDesignRuleById(id: string): Promise<IStudioDesignRule | null> {
    return postgresStudioDesignRuleRepository.findById(id);
  }

  async createDesignRule(data: Partial<IStudioDesignRule>): Promise<IStudioDesignRule> {
    return postgresStudioDesignRuleRepository.create(data);
  }

  async updateDesignRule(id: string, data: Partial<IStudioDesignRule>): Promise<IStudioDesignRule> {
    return postgresStudioDesignRuleRepository.update(id, data);
  }

  async duplicateDesignRule(id: string, newName?: string): Promise<IStudioDesignRule> {
    return postgresStudioDesignRuleRepository.duplicate(id, newName);
  }

  async deleteDesignRule(id: string): Promise<boolean> {
    return postgresStudioDesignRuleRepository.delete(id);
  }

  // ==========================================================================
  // VISUAL ASSEMBLY STRUCTURES
  // ==========================================================================
  async getAssemblyStructure(
    constructionMethodId: string,
    subcategoryId?: string | null
  ): Promise<IStudioAssemblyStructure | null> {
    return postgresStudioAssemblyRepository.findByMethodAndSubcategory(constructionMethodId, subcategoryId);
  }

  async getAssemblyStructureById(id: string): Promise<IStudioAssemblyStructure | null> {
    return postgresStudioAssemblyRepository.findById(id);
  }

  async saveAssemblyStructure(data: Partial<IStudioAssemblyStructure>): Promise<IStudioAssemblyStructure> {
    if (data.id) {
      const existing = await postgresStudioAssemblyRepository.findById(data.id);
      if (existing) {
        return postgresStudioAssemblyRepository.update(data.id, data);
      }
    }
    return postgresStudioAssemblyRepository.create(data);
  }

  async deleteAssemblyStructure(id: string): Promise<boolean> {
    return postgresStudioAssemblyRepository.delete(id);
  }

  // ==========================================================================
  // EXPLICIT MATERIAL LINKING
  // ==========================================================================
  async getAllMaterialLinks(): Promise<IStudioMaterialLink[]> {
    return postgresMaterialLinkRepository.findAll();
  }

  async getMaterialLink(id: string): Promise<IStudioMaterialLink | null> {
    return postgresMaterialLinkRepository.findById(id);
  }

  async createMaterialLink(data: Partial<IStudioMaterialLink>): Promise<IStudioMaterialLink> {
    return postgresMaterialLinkRepository.create(data);
  }

  async updateMaterialLink(id: string, data: Partial<IStudioMaterialLink>): Promise<IStudioMaterialLink> {
    return postgresMaterialLinkRepository.update(id, data);
  }

  async deleteMaterialLink(id: string): Promise<boolean> {
    return postgresMaterialLinkRepository.delete(id);
  }

  /**
   * Resolves the authoritative stock source for a material variant.
   * If an explicit link exists, uses the link's authoritative source.
   * Otherwise, treats the material's own inventory as authoritative.
   */
  async resolveAuthoritativeStock(
    studioMaterialId: string,
    sku?: string | null
  ): Promise<{ isLinked: boolean; authoritativeSource: string; consumptionQty: number }> {
    const link = await postgresMaterialLinkRepository.findByStudioMaterial(studioMaterialId, sku);
    if (!link) {
      return { isLinked: false, authoritativeSource: "studio", consumptionQty: 1 };
    }
    return {
      isLinked: true,
      authoritativeSource: link.authoritativeSource,
      consumptionQty: link.consumptionQty || 1,
    };
  }

  // ==========================================================================
  // OPTIONAL PHYSICAL CALIBRATION ENGINE
  // ==========================================================================
  /**
   * Calculates beadable length and physical fit ONLY if measurements are entered.
   * NEVER invents missing numbers or claims validation passed when fields are absent.
   */
  calculatePhysicalFit(
    specs: PhysicalSpecsConfig,
    components: Array<{ diameterMm?: number; widthMm?: number }>
  ): {
    calibrationState: "complete" | "incomplete";
    totalComponentLengthMm: number;
    beadableLengthMm: number | null;
    remainingSpaceMm: number | null;
    isValidFit: boolean;
    reason?: string;
  } {
    const totalComponentLengthMm = components.reduce((acc, c) => {
      const d = c.diameterMm || c.widthMm || 0;
      return acc + d;
    }, 0);

    const actualLength = specs.actualWireLengthMm;
    const loopAllowance = specs.endLoopAllowanceMm ?? 0;

    // Check if required measurements exist
    if (actualLength != null && actualLength > 0) {
      const beadableLengthMm = Math.max(0, actualLength - 2 * loopAllowance);
      const remainingSpaceMm = beadableLengthMm - totalComponentLengthMm;
      const isValidFit = remainingSpaceMm >= 0;

      return {
        calibrationState: "complete",
        totalComponentLengthMm,
        beadableLengthMm,
        remainingSpaceMm,
        isValidFit,
        reason: isValidFit ? undefined : `Components exceed beadable wire length by ${Math.abs(remainingSpaceMm).toFixed(1)}mm`,
      };
    }

    // Missing measurements: calibration is incomplete, never reject valid designs
    return {
      calibrationState: "incomplete",
      totalComponentLengthMm,
      beadableLengthMm: null,
      remainingSpaceMm: null,
      isValidFit: true,
      reason: "Physical measurements not fully configured; fit check uncalibrated.",
    };
  }

  // ==========================================================================
  // CUSTOM DESIGN CART & ORDER SNAPSHOT GENERATOR
  // ==========================================================================
  createStudioDesignSnapshot(params: {
    category: IStudioCategory | null;
    subcategory: IStudioCategory | null;
    method: IStudioConstructionMethod;
    rule: IStudioDesignRule | null;
    assemblyStructure: IStudioAssemblyStructure | null;
    baseMaterialSku?: string | null;
    selectedSizeLabel?: string | null;
    physicalMeasurements?: Record<string, any>;
    endpointASelection?: Record<string, any>;
    endpointBSelection?: Record<string, any>;
    components: any[];
    pricing: {
      componentsTotal: number;
      makingCharge: number;
      estimatedTotal: number;
    };
  }) {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      studioSource: "create_your_own",
      category: params.category ? { id: params.category.id, name: params.category.name, slug: params.category.slug } : null,
      subcategory: params.subcategory ? { id: params.subcategory.id, name: params.subcategory.name, slug: params.subcategory.slug } : null,
      constructionMethod: {
        id: params.method.id,
        name: params.method.name,
        slug: params.method.slug,
        baseMaterialType: params.method.baseMaterialType,
      },
      ruleSnapshot: params.rule ? { id: params.rule.id, name: params.rule.name, version: params.rule.version } : null,
      baseMaterialSku: params.baseMaterialSku || null,
      selectedSizeLabel: params.selectedSizeLabel || null,
      physicalMeasurements: params.physicalMeasurements || {},
      endpointASelection: params.endpointASelection || {},
      endpointBSelection: params.endpointBSelection || {},
      components: params.components,
      visualStructureSnapshot: params.assemblyStructure ? {
        id: params.assemblyStructure.id,
        name: params.assemblyStructure.name,
        canvasConfig: params.assemblyStructure.canvasConfig,
        nodes: params.assemblyStructure.nodes,
        connections: params.assemblyStructure.connections,
        attachmentPoints: params.assemblyStructure.attachmentPoints,
      } : null,
      pricingSnapshot: params.pricing,
    };
  }
}

export const independentStudioService = new IndependentStudioService();
