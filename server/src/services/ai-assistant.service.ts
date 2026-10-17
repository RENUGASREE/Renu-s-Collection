import { StudioMaterial, IStudioMaterial } from "../models/StudioMaterial.js";
import { DesignRule } from "../models/DesignRule.js";
import { calculateDesignPrice, initStudioDefaults } from "./studio.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";
import crypto from "crypto";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface AIDesignPromptInput {
  prompt: string;
  jewelleryType?: string;
  occasion?: string;
  colorTheme?: string;
  budget?: number;
  style?: string;
  wristMm?: number;
}

export interface SuggestionBead {
  variantSku: string;
  materialId: string;
  displayName: string;
  diameterMm: number;
  color?: string;
  imageUrl?: string;
  renderAssetUrl?: string;
}

export interface SuggestionCharm {
  variantSku: string;
  materialId: string;
  displayName: string;
  anchorIndex: number;
  imageUrl?: string;
  renderAssetUrl?: string;
}

export interface AIDesignSuggestion {
  id: string;
  name: string;
  tagline: string;
  description: string;
  matchReason: string;
  style: string;
  occasion: string;
  colorTheme: string;
  wristMm: number;
  isAiGenerated: boolean;
  beadSequence: SuggestionBead[];
  charms: SuggestionCharm[];
  pricingQuote: {
    baseMakingCharge: number;
    componentSubtotal: number;
    totalPrice: number;
    breakdown: Array<{
      variantSku: string;
      materialName: string;
      quantity: number;
      unitRate: number;
      subtotal: number;
    }>;
  };
  fitSummary: {
    beadCount: number;
    estimatedCircumferenceMm: number;
    targetCircumferenceMm: number;
    isCompliantWithRules: boolean;
  };
}

interface ActiveMaterialContext {
  material: IStudioMaterial;
  sku: string;
  name: string;
  color?: string;
  materialType: string;
  diameterMm: number;
  sellingRate: number;
  imageUrl: string;
  renderAssetUrl?: string;
}

// ============================================================================
// THEME & COLOR KEYWORD MATCHING
// ============================================================================

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

// ============================================================================
// GROUNDED CATALOGUE RECOMMENDATION ENGINE
// ============================================================================

export async function generateDesignSuggestions(
  input: AIDesignPromptInput
): Promise<AIDesignSuggestion[]> {
  const selectedType = (input.jewelleryType || "bracelet").toLowerCase();
  const prompt = (input.prompt || "").trim();
  const wristMm = Number(input.wristMm) && input.wristMm! >= 120 && input.wristMm! <= 240 ? input.wristMm! : 160;
  const userBudget = input.budget && input.budget > 0 ? input.budget : undefined;

  // 1. Fetch active materials eligible for the selected jewellery type
  let rawMaterials = await StudioMaterial.find({
    isActive: true,
    allowedJewelleryTypes: selectedType,
  }).lean();

  if ((!rawMaterials || rawMaterials.length === 0) && selectedType === "bracelet") {
    // Self-healing: initialize defaults if catalogue is not yet seeded
    await initStudioDefaults();
    rawMaterials = await StudioMaterial.find({
      isActive: true,
      allowedJewelleryTypes: "bracelet",
    }).lean();
  }

  if (!rawMaterials || rawMaterials.length === 0) {
    throw new AppError(
      `No active catalogue materials found for "${selectedType}" in the studio library. Design assistance requires stocked components.`,
      404
    );
  }

  // 2. Fetch active design rule
  const rule = await DesignRule.findOne({
    jewelleryType: selectedType,
    isActive: true,
  }).lean();

  const fitAllowance = rule?.fitAllowanceMm ?? 10;
  const targetCircumference = wristMm + fitAllowance; // e.g. 170mm for 160mm wrist
  const minBeads = rule?.minComponents ?? 12;
  const maxBeads = rule?.maxComponents ?? 45;
  const maxCharms = rule?.maxCharms ?? 5;

  // 3. Separate materials into Beads/Stones and Charms/Spacers
  const beadOptions: ActiveMaterialContext[] = [];
  const spacerOptions: ActiveMaterialContext[] = [];
  const charmOptions: ActiveMaterialContext[] = [];

  for (const m of rawMaterials) {
    for (const v of m.variants || []) {
      if (!v.isActive) continue;
      const ctx: ActiveMaterialContext = {
        material: m as any,
        sku: v.sku,
        name: m.name,
        color: v.color,
        materialType: m.materialType,
        diameterMm: v.dimensionsMm?.diameterMm || 8,
        sellingRate: v.sellingRate,
        imageUrl: m.imageUrl || "",
        renderAssetUrl: m.renderAssetUrl,
      };

      if (m.materialType === "charm") {
        charmOptions.push(ctx);
      } else if (m.materialType === "spacer") {
        spacerOptions.push(ctx);
      } else {
        beadOptions.push(ctx);
      }
    }
  }

  if (beadOptions.length === 0) {
    throw new AppError("No active bracelet beads found in the studio catalogue.", 404);
  }

  // 4. Try external AI provider if configured in environment, with strict grounding
  const geminiApiKey = env.GEMINI_API_KEY;
  const geminiModel = env.GEMINI_MODEL || "gemini-2.5-flash";

  if (geminiApiKey) {
    try {
      const aiSuggestions = await queryGeminiForSuggestions({
        apiKey: geminiApiKey,
        model: geminiModel,
        prompt,
        occasion: input.occasion,
        colorTheme: input.colorTheme,
        style: input.style,
        budget: userBudget,
        wristMm,
        beadOptions,
        spacerOptions,
        charmOptions,
        targetCircumference,
      });

      if (aiSuggestions && aiSuggestions.length > 0) {
        // Validate every suggestion against actual catalogue & compute authoritative prices
        const validated = await validateAndPriceSuggestions(
          aiSuggestions,
          beadOptions,
          spacerOptions,
          charmOptions,
          targetCircumference,
          minBeads,
          maxBeads,
          maxCharms,
          true // isAiGenerated = true
        );
        if (validated.length > 0) {
          return validated;
        }
      }
    } catch (aiErr: any) {
      // Log only safe category tokens (never log URLs, query parameters, or unfiltered error objects)
      const category =
        typeof aiErr?.message === "string" && /^(http_\d+|timeout|network_error|malformed_response)$/.test(aiErr.message)
          ? aiErr.message
          : "unexpected_provider_error";
      console.warn(`[AI Assistant] External AI provider unavailable (${category}); using catalogue recommendation engine.`);
    }
  }

  // 5. Native Catalogue-Grounded Recommendation Engine (always works, 100% grounded)
  return buildCatalogueGroundedSuggestions({
    prompt,
    occasion: input.occasion,
    colorTheme: input.colorTheme,
    style: input.style,
    budget: userBudget,
    wristMm,
    targetCircumference,
    beadOptions,
    spacerOptions,
    charmOptions,
    minBeads,
    maxBeads,
    maxCharms,
  });
}

// ============================================================================
// GEMINI PROVIDER INTEGRATION WITH CATALOGUE GROUNDING
// ============================================================================

async function queryGeminiForSuggestions(params: {
  apiKey: string;
  model?: string;
  prompt: string;
  occasion?: string;
  colorTheme?: string;
  style?: string;
  budget?: number;
  wristMm: number;
  beadOptions: ActiveMaterialContext[];
  spacerOptions: ActiveMaterialContext[];
  charmOptions: ActiveMaterialContext[];
  targetCircumference: number;
}): Promise<any[]> {
  const model = params.model || "gemini-2.5-flash";
  const catalogueSummary = [
    ...params.beadOptions.map((b) => `BEAD SKU: ${b.sku} | Name: ${b.name} | Color: ${b.color || "natural"} | Size: ${b.diameterMm}mm | Rate: ₹${b.sellingRate}`),
    ...params.spacerOptions.map((s) => `SPACER SKU: ${s.sku} | Name: ${s.name} | Color: ${s.color || "metal"} | Size: ${s.diameterMm}mm | Rate: ₹${s.sellingRate}`),
    ...params.charmOptions.map((c) => `CHARM SKU: ${c.sku} | Name: ${c.name} | Rate: ₹${c.sellingRate}`),
  ].join("\n");

  const systemInstruction = `You are the master jewelry artisan at Renu's Collections boutique studio.
Your goal is to suggest 2 to 3 handcrafted custom gemstone elastic bracelets based on the customer's request.
CRITICAL CATALOGUE INTEGRITY RULES:
1. You MUST ONLY pick SKUs that exist in the provided catalogue list below. NEVER INVENT A SKU.
2. The total sum of bead diameters in 'beadSequence' MUST approximate the target length of ${params.targetCircumference} mm (within ±10 mm).
3. 'beadSequence' must be an array of valid bead/spacer SKUs in exact stringing order.
4. 'charms' must be an array of objects: { sku: string, anchorIndex: number } (anchorIndex is 0-indexed position in beadSequence). Maximum 2 charms.
5. Provide a warm, authentic Indian artisan description and a clear 'matchReason' explaining why this fits their requested occasion/colors.
6. Return STRICTLY valid JSON conforming to the requested schema. No markdown code fences.`;

  const userQuery = `Customer Request: "${params.prompt}"
Occasion: ${params.occasion || "Versatile wear"}
Color Theme: ${params.colorTheme || "Harmonious"}
Style: ${params.style || "Artisanal Elegance"}
Wrist Size: ${params.wristMm} mm (Target Bracelet Length: ${params.targetCircumference} mm)
${params.budget ? `Budget: Under ₹${params.budget}` : ""}

AVAILABLE STUDIO CATALOGUE:
${catalogueSummary}

JSON Schema:
{
  "suggestions": [
    {
      "name": "Design Name",
      "tagline": "Short poetic tagline",
      "description": "Artisan narrative",
      "matchReason": "Why this specific combination matches the customer prompt",
      "style": "Minimalist | Statement | Spiritual | Classic",
      "occasion": "Occasion name",
      "colorTheme": "Color theme",
      "beadSequence": ["SKU1", "SKU2", ...],
      "charms": [{ "sku": "CHARM_SKU", "anchorIndex": 10 }]
    }
  ]
}`;

  let response: Response;
  try {
    // Authenticate via x-goog-api-key header; never place key in URL query params
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": params.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemInstruction}\n\n${userQuery}` }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(8000), // 8-second safety timeout
      }
    );
  } catch (fetchErr: any) {
    // Intercept network/timeout error so that raw fetch error objects/URLs never escape
    const isTimeout = fetchErr?.name === "TimeoutError" || fetchErr?.name === "AbortError";
    throw new Error(isTimeout ? "timeout" : "network_error");
  }

  if (!response.ok) {
    throw new Error(`http_${response.status}`);
  }

  let parsed: any;
  try {
    const result = (await response.json()) as any;
    const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) return [];
    parsed = JSON.parse(textContent);
  } catch {
    throw new Error("malformed_response");
  }

  return Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
}

// ============================================================================
// CATALOGUE-GROUNDED FALLBACK ENGINE
// ============================================================================

function buildCatalogueGroundedSuggestions(params: {
  prompt: string;
  occasion?: string;
  colorTheme?: string;
  style?: string;
  budget?: number;
  wristMm: number;
  targetCircumference: number;
  beadOptions: ActiveMaterialContext[];
  spacerOptions: ActiveMaterialContext[];
  charmOptions: ActiveMaterialContext[];
  minBeads: number;
  maxBeads: number;
  maxCharms: number;
}): Promise<AIDesignSuggestion[]> {
  const words = extractKeywords(`${params.prompt} ${params.occasion || ""} ${params.colorTheme || ""} ${params.style || ""}`);

  // Palette score helper
  const scoreOption = (opt: ActiveMaterialContext) => {
    let score = 0;
    const nameLower = opt.name.toLowerCase();
    const colorLower = (opt.color || "").toLowerCase();

    for (const w of words) {
      if (nameLower.includes(w)) score += 5;
      if (colorLower.includes(w)) score += 4;
    }

    // Occasion heuristics
    if (words.has("wedding") || words.has("festive") || words.has("party")) {
      if (colorLower.includes("gold") || colorLower.includes("pearl") || colorLower.includes("pink")) score += 3;
    }
    if (words.has("daily") || words.has("office") || words.has("minimal")) {
      if (colorLower.includes("black") || colorLower.includes("silver") || colorLower.includes("matte")) score += 3;
    }
    if (words.has("spiritual") || words.has("meditation") || words.has("yoga") || words.has("healing")) {
      if (nameLower.includes("amethyst") || nameLower.includes("onyx") || nameLower.includes("lava") || nameLower.includes("tiger")) score += 4;
    }

    return score;
  };

  const sortedBeads = [...params.beadOptions].sort((a, b) => scoreOption(b) - scoreOption(a));
  const primaryBead = sortedBeads[0] || params.beadOptions[0];
  const secondaryBead = sortedBeads[1] || params.beadOptions[1] || primaryBead;
  const accentBead = sortedBeads[2] || params.beadOptions[2] || primaryBead;

  const spacer = params.spacerOptions[0];
  const charm = params.charmOptions[0];

  const proposals: Array<{
    name: string;
    tagline: string;
    description: string;
    matchReason: string;
    style: string;
    occasion: string;
    colorTheme: string;
    beadSequenceSkus: string[];
    charmsSkus: Array<{ sku: string; anchorIndex: number }>;
  }> = [];

  // Suggestion 1: The Harmonious Balance (Symmetrical pattern with primary & secondary)
  {
    const beadSeq: string[] = [];
    let currentLength = 0;
    let toggle = false;

    while (currentLength + primaryBead.diameterMm <= params.targetCircumference) {
      const chosen = toggle ? secondaryBead : primaryBead;
      beadSeq.push(chosen.sku);
      currentLength += chosen.diameterMm;
      toggle = !toggle;
    }

    // Ensure within rule bounds
    while (beadSeq.length < params.minBeads) {
      beadSeq.push(primaryBead.sku);
      currentLength += primaryBead.diameterMm;
    }

    const charmsSkus: Array<{ sku: string; anchorIndex: number }> = [];
    if (charm && beadSeq.length > 5) {
      charmsSkus.push({ sku: charm.sku, anchorIndex: Math.floor(beadSeq.length / 2) });
    }

    proposals.push({
      name: `${primaryBead.name} & ${secondaryBead.name} Harmony`,
      tagline: "Artisanal symmetry celebrating balance and natural gemstone brilliance",
      description: `Handcrafted with ${primaryBead.name} paired harmoniously with ${secondaryBead.name}, calibrated comfortably for a ${params.wristMm}mm wrist.`,
      matchReason: `Selected for its balanced aesthetic matching your interest in ${primaryBead.color || "natural"} tones, suitable for ${params.occasion || "everyday elegance"}.`,
      style: params.style || "Classic Harmony",
      occasion: params.occasion || "Versatile",
      colorTheme: params.colorTheme || `${primaryBead.color || "Natural"} & ${secondaryBead.color || "Earthy"}`,
      beadSequenceSkus: beadSeq,
      charmsSkus,
    });
  }

  // Suggestion 2: The Minimalist Signature (Uniform main stone with subtle spacers)
  {
    const beadSeq: string[] = [];
    let currentLength = 0;
    const spacerInterval = 5;

    while (currentLength + primaryBead.diameterMm <= params.targetCircumference) {
      if (spacer && beadSeq.length > 0 && beadSeq.length % spacerInterval === 0 && currentLength + spacer.diameterMm + primaryBead.diameterMm <= params.targetCircumference) {
        beadSeq.push(spacer.sku);
        currentLength += spacer.diameterMm;
      }
      beadSeq.push(primaryBead.sku);
      currentLength += primaryBead.diameterMm;
    }

    while (beadSeq.length < params.minBeads) {
      beadSeq.push(primaryBead.sku);
    }

    proposals.push({
      name: `Signature Pure ${primaryBead.name}`,
      tagline: "Timeless minimalist sophistication focused on pure gemstone depth",
      description: `A continuous sequence of polished ${primaryBead.name} accented with delicate spacers, designed for effortless daily grace.`,
      matchReason: `Highlights ${primaryBead.name} as a focal statement stone, honoring your preference for a refined, understated luxury feel.`,
      style: "Minimalist Modern",
      occasion: params.occasion || "Daily & Office Wear",
      colorTheme: primaryBead.color || "Monochrome Luxe",
      beadSequenceSkus: beadSeq,
      charmsSkus: [],
    });
  }

  // Suggestion 3: The Artisan Statement (Trio arrangement with charm accent)
  if (accentBead && accentBead.sku !== primaryBead.sku) {
    const beadSeq: string[] = [];
    let currentLength = 0;
    const trio = [primaryBead, accentBead, secondaryBead];
    let idx = 0;

    while (currentLength + trio[idx % trio.length].diameterMm <= params.targetCircumference) {
      const b = trio[idx % trio.length];
      beadSeq.push(b.sku);
      currentLength += b.diameterMm;
      idx++;
    }

    while (beadSeq.length < params.minBeads) {
      beadSeq.push(primaryBead.sku);
    }

    const charmsSkus: Array<{ sku: string; anchorIndex: number }> = [];
    if (charm && beadSeq.length > 6) {
      charmsSkus.push({ sku: charm.sku, anchorIndex: Math.floor(beadSeq.length / 2) });
    }

    proposals.push({
      name: `${primaryBead.name} Celestial Ensemble`,
      tagline: "Expressive multi-stone artisanal arrangement rich in color and texture",
      description: `A vibrant symphony blending ${primaryBead.name}, ${accentBead.name}, and ${secondaryBead.name} with focal centerpiece detailing.`,
      matchReason: `Crafted for celebratory or expressive moments, offering striking depth that complements your color preference.`,
      style: "Artisan Statement",
      occasion: params.occasion || "Celebration & Evening",
      colorTheme: "Multi-stone Palette",
      beadSequenceSkus: beadSeq,
      charmsSkus,
    });
  }

  return validateAndPriceSuggestions(
    proposals.map((p) => ({
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      matchReason: p.matchReason,
      style: p.style,
      occasion: p.occasion,
      colorTheme: p.colorTheme,
      beadSequence: p.beadSequenceSkus,
      charms: p.charmsSkus,
    })),
    params.beadOptions,
    params.spacerOptions,
    params.charmOptions,
    params.targetCircumference,
    params.minBeads,
    params.maxBeads,
    params.maxCharms,
    false // isAiGenerated = false (catalogue-curated fallback)
  );
}

// ============================================================================
// AUTHORITATIVE VALIDATION & PRICING
// ============================================================================

async function validateAndPriceSuggestions(
  rawSuggestions: any[],
  beads: ActiveMaterialContext[],
  spacers: ActiveMaterialContext[],
  charms: ActiveMaterialContext[],
  targetCircumference: number,
  minBeads: number,
  maxBeads: number,
  maxCharms: number,
  isAiGenerated = false
): Promise<AIDesignSuggestion[]> {
  const allVariantsMap = new Map<string, ActiveMaterialContext>();
  for (const opt of [...beads, ...spacers, ...charms]) {
    allVariantsMap.set(opt.sku, opt);
  }

  const results: AIDesignSuggestion[] = [];

  for (const raw of rawSuggestions) {
    if (!raw.name || !Array.isArray(raw.beadSequence) || raw.beadSequence.length === 0) {
      continue;
    }

    // 1. Validate every bead SKU exists in the active catalogue
    const validatedBeads: SuggestionBead[] = [];
    let estimatedLength = 0;

    for (const sku of raw.beadSequence) {
      const found = allVariantsMap.get(typeof sku === "string" ? sku.trim().toUpperCase() : "");
      if (found && found.materialType !== "charm") {
        validatedBeads.push({
          variantSku: found.sku,
          materialId: found.material._id.toString(),
          displayName: found.name,
          diameterMm: found.diameterMm,
          color: found.color,
          imageUrl: found.imageUrl,
          renderAssetUrl: found.renderAssetUrl,
        });
        estimatedLength += found.diameterMm;
      }
    }

    if (validatedBeads.length < minBeads) {
      // Top up with valid primary bead to satisfy design rule
      const fallback = beads[0];
      while (validatedBeads.length < minBeads && fallback) {
        validatedBeads.push({
          variantSku: fallback.sku,
          materialId: fallback.material._id.toString(),
          displayName: fallback.name,
          diameterMm: fallback.diameterMm,
          color: fallback.color,
          imageUrl: fallback.imageUrl,
          renderAssetUrl: fallback.renderAssetUrl,
        });
        estimatedLength += fallback.diameterMm;
      }
    }

    if (validatedBeads.length > maxBeads) {
      validatedBeads.splice(maxBeads);
    }

    // 2. Validate charms
    const validatedCharms: SuggestionCharm[] = [];
    if (Array.isArray(raw.charms)) {
      for (const ch of raw.charms) {
        if (validatedCharms.length >= maxCharms) break;
        const sku = typeof ch.sku === "string" ? ch.sku.trim().toUpperCase() : "";
        const found = allVariantsMap.get(sku);
        if (found && found.materialType === "charm") {
          const anchorIdx = Math.max(0, Math.min(Number(ch.anchorIndex) || 0, validatedBeads.length - 1));
          validatedCharms.push({
            variantSku: found.sku,
            materialId: found.material._id.toString(),
            displayName: found.name,
            anchorIndex: anchorIdx,
            imageUrl: found.imageUrl,
            renderAssetUrl: found.renderAssetUrl,
          });
        }
      }
    }

    // 3. Compute component counts for authoritative pricing calculation
    const skuCounts: Record<string, number> = {};
    for (const b of validatedBeads) {
      skuCounts[b.variantSku] = (skuCounts[b.variantSku] || 0) + 1;
    }
    for (const c of validatedCharms) {
      skuCounts[c.variantSku] = (skuCounts[c.variantSku] || 0) + 1;
    }

    const componentInputs = Object.entries(skuCounts).map(([variantSku, quantity]) => ({
      variantSku,
      quantity,
    }));

    try {
      // Authoritative pricing from active Studio price service
      const quote = await calculateDesignPrice({
        jewelleryType: "bracelet",
        constructionType: "elastic_bead",
        components: componentInputs,
      });

      results.push({
        id: `ai_${crypto.randomUUID().slice(0, 8)}`,
        name: raw.name.slice(0, 80),
        tagline: raw.tagline || (isAiGenerated ? "Handcrafted AI bespoke design" : "Handcrafted studio design"),
        description:
          raw.description ||
          (isAiGenerated
            ? "Designed in consultation with our AI Jewelry Artisan."
            : "Curated handcrafted studio design."),
        matchReason:
          raw.matchReason ||
          (isAiGenerated
            ? "Curated based on your selected aesthetic and gemstone preferences."
            : "Hand-selected by studio artisans based on your aesthetic preferences."),
        style: raw.style || "Artisanal Elegance",
        occasion: raw.occasion || "Versatile",
        colorTheme: raw.colorTheme || "Harmonious",
        wristMm: 160,
        isAiGenerated,
        beadSequence: validatedBeads,
        charms: validatedCharms,
        pricingQuote: {
          baseMakingCharge: quote.makingCharge.baseFee,
          componentSubtotal: quote.componentSubtotal,
          totalPrice: quote.totalPrice,
          breakdown: quote.items.map((i) => ({
            variantSku: i.variantSku,
            materialName: i.materialName,
            quantity: i.quantity,
            unitRate: i.unitRate,
            subtotal: i.subtotal,
          })),
        },
        fitSummary: {
          beadCount: validatedBeads.length,
          estimatedCircumferenceMm: estimatedLength,
          targetCircumferenceMm: targetCircumference,
          isCompliantWithRules:
            validatedBeads.length >= minBeads &&
            validatedBeads.length <= maxBeads &&
            validatedCharms.length <= maxCharms,
        },
      });
    } catch (err) {
      console.warn("Failed to calculate authoritative price for suggested design:", err);
    }
  }

  return results;
}
