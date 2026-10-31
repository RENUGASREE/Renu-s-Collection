import { StudioMaterial, IStudioMaterial } from "../models/StudioMaterial.js";
import { JewelleryType } from "../models/JewelleryType.js";
import { DesignRule } from "../models/DesignRule.js";
import { calculateDesignPrice } from "./studio.service.js";
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

  // 1. Verify category is published, active, and open for designer orders
  const jType = await JewelleryType.findOne({
    slug: selectedType,
    isPublished: true,
    isEnabled: { $ne: false },
    isArchived: { $ne: true },
  });

  if (!jType) {
    throw new AppError(
      `Jewellery category "${selectedType}" is not published or currently unavailable for custom orders.`,
      404
    );
  }

  if (jType.designerStatus !== "available") {
    throw new AppError(
      `Jewellery category "${jType.displayName}" is currently marked as ${jType.designerStatus.replace("_", " ")} and not open for orders.`,
      400
    );
  }

  // 2. Fetch active materials eligible for the selected jewellery type
  const rawMaterials = await StudioMaterial.find({
    isActive: true,
    allowedJewelleryTypes: selectedType,
  }).lean();

  if (!rawMaterials || rawMaterials.length === 0) {
    throw new AppError(
      `No active catalogue materials found for "${selectedType}" in the studio library. Design assistance requires stocked components managed through the Admin Studio.`,
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
      if (!v.isActive || typeof v.stock !== "number" || v.stock <= 0) continue;
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
    throw new AppError(`No in-stock beads or gemstones currently available for "${selectedType}" in the studio inventory.`, 404);
  }

  // Detect specific charm requests to prevent ungrounded substitutions
  const promptLower = prompt.toLowerCase();
  const charmRegex = /(?:([a-z0-9-]+)\s+(?:shaped\s+)?charm)|(?:charm\s+with\s+([a-z0-9-]+))|(?:initial\s+([a-z]))|(?:letter\s+([a-z]))/i;
  const match = promptLower.match(charmRegex);
  const rawKeyword = match ? (match[1] || match[2] || match[3] || match[4])?.trim().toLowerCase() : null;
  const ignoredWords = new Set(["a", "an", "the", "with", "and", "gold", "silver", "custom", "little", "cute", "small"]);
  const requestedCharmKeyword = rawKeyword && !ignoredWords.has(rawKeyword) ? rawKeyword : null;

  let unavailableCharmInfo: { requestedKeyword: string } | undefined = undefined;
  if (requestedCharmKeyword) {
    const hasMatchingCharm = charmOptions.some((c) => {
      const name = c.name.toLowerCase();
      const sku = c.sku.toLowerCase();
      if (requestedCharmKeyword.length === 1) {
        const letterRegex = new RegExp(`(^|[\\s-_])${requestedCharmKeyword}([\\s-_]|$)`, "i");
        return letterRegex.test(name) || letterRegex.test(sku);
      }
      return name.includes(requestedCharmKeyword) || sku.includes(requestedCharmKeyword);
    });
    if (!hasMatchingCharm) {
      unavailableCharmInfo = { requestedKeyword: requestedCharmKeyword };
    }
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
        const constructionType = rule?.constructionType || "elastic_bead";
        const validated = await validateAndPriceSuggestions(
          aiSuggestions,
          beadOptions,
          spacerOptions,
          charmOptions,
          targetCircumference,
          minBeads,
          maxBeads,
          maxCharms,
          selectedType,
          constructionType,
          true, // isAiGenerated = true
          unavailableCharmInfo
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
  const constructionType = rule?.constructionType || "elastic_bead";
  return buildCatalogueGroundedSuggestions({
    jewelleryType: selectedType,
    constructionType,
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
6. Return STRICTLY valid JSON conforming to the requested schema. No markdown code fences.
7. CRITICAL CHARM GROUNDING: If the customer requests a specific charm motif, initial, or letter (e.g. "R charm", "evil eye charm") and that exact charm does NOT exist in the catalogue list, DO NOT substitute an arbitrary charm (such as a star). Return an empty charms array ("charms": []) and explicitly state in both description and matchReason that the requested charm is currently unavailable in the studio catalogue.`;

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
  jewelleryType: string;
  constructionType: string;
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

  // Identify matching beads from catalogue based on keyword scoring
  const matchingBeads = sortedBeads.filter((b) => scoreOption(b) > 0);
  const primaryBead = matchingBeads[0] || sortedBeads[0] || params.beadOptions[0];
  const secondaryBead = matchingBeads[1] || sortedBeads[1] || primaryBead;
  const spacer = params.spacerOptions[0];

  // Detect whether user requested a single color/stone or multiple contrasting colors
  const isMultiColorRequested =
    matchingBeads.length >= 2 &&
    scoreOption(matchingBeads[1]) >= 4 &&
    matchingBeads[0].sku !== matchingBeads[1].sku;

  // Grounded Charm Detection:
  const promptLower = params.prompt.toLowerCase();
  const charmRegex = /(?:([a-z0-9-]+)\s+(?:shaped\s+)?charm)|(?:charm\s+with\s+([a-z0-9-]+))|(?:initial\s+([a-z]))|(?:letter\s+([a-z]))/i;
  const match = promptLower.match(charmRegex);
  const rawKeyword = match ? (match[1] || match[2] || match[3] || match[4])?.trim().toLowerCase() : null;
  const ignoredWords = new Set(["a", "an", "the", "with", "and", "gold", "silver", "custom", "little", "cute", "small"]);
  const requestedKeyword = rawKeyword && !ignoredWords.has(rawKeyword) ? rawKeyword : null;

  let matchedCharm: ActiveMaterialContext | null = null;
  let isUnavailableCharmRequested = false;

  if (requestedKeyword) {
    const found = params.charmOptions.find((c) => {
      const name = c.name.toLowerCase();
      const sku = c.sku.toLowerCase();
      if (requestedKeyword.length === 1) {
        const letterRegex = new RegExp(`(^|[\\s-_])${requestedKeyword}([\\s-_]|$)`, "i");
        return letterRegex.test(name) || letterRegex.test(sku);
      }
      return name.includes(requestedKeyword) || sku.includes(requestedKeyword);
    });
    if (found) {
      matchedCharm = found;
    } else {
      isUnavailableCharmRequested = true;
    }
  } else if (promptLower.includes("charm")) {
    matchedCharm = params.charmOptions[0] || null;
  }

  const charmUnavailableNotice = isUnavailableCharmRequested && requestedKeyword
    ? ` Note: The requested "${requestedKeyword.toUpperCase()}" charm is currently unavailable in our studio catalogue. This arrangement focuses on your requested gemstones without an ungrounded charm substitution.`
    : "";

  // Helper to build a bead sequence of exact target length
  const targetBeadCount = Math.max(
    params.minBeads,
    Math.min(params.maxBeads, Math.round(params.targetCircumference / (primaryBead.diameterMm || 8)))
  );

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

  if (isMultiColorRequested) {
    // ------------------------------------------------------------------------
    // CASE A: User requested multiple stones / colors (e.g. "blue and pink")
    // ------------------------------------------------------------------------

    // Style 1: Symmetrical Focal Centerpiece (Stone A body with Stone B focal centerpiece)
    {
      const focalCount = Math.min(5, Math.max(3, Math.floor(targetBeadCount * 0.25)));
      const sideCount = Math.floor((targetBeadCount - focalCount) / 2);
      const remainder = targetBeadCount - focalCount - sideCount * 2;

      const beadSeq: string[] = [
        ...Array(sideCount).fill(primaryBead.sku),
        ...Array(focalCount).fill(secondaryBead.sku),
        ...Array(sideCount + remainder).fill(primaryBead.sku),
      ];

      const charmsSkus: Array<{ sku: string; anchorIndex: number }> = [];
      if (matchedCharm) {
        charmsSkus.push({ sku: matchedCharm.sku, anchorIndex: sideCount + Math.floor(focalCount / 2) });
      }

      proposals.push({
        name: `${secondaryBead.name} Centerpiece on ${primaryBead.name}`,
        tagline: "Symmetrical statement design highlighting your requested gemstone focal center",
        description: `Handcrafted with ${primaryBead.name} along the main body, framed by a striking ${focalCount}-bead focal centerpiece of ${secondaryBead.name} centered on the wrist.${matchedCharm ? ` Accented with our ${matchedCharm.name}.` : ""}${charmUnavailableNotice}`,
        matchReason: `Crafted directly for your prompt requesting ${primaryBead.name} and ${secondaryBead.name}, placing them in a balanced, designer focal symmetry rather than random stripes.${charmUnavailableNotice}`,
        style: "Artisan Symmetrical Statement",
        occasion: params.occasion || "Celebration & Everyday Luxury",
        colorTheme: `${primaryBead.color || "Natural"} & ${secondaryBead.color || "Accent"}`,
        beadSequenceSkus: beadSeq,
        charmsSkus,
      });
    }

    // Style 2: Rhythmic Designer Clusters (Groups of 3 or 4 of Stone A with 1 of Stone B)
    {
      const beadSeq: string[] = [];
      const clusterSize = 3;
      let countA = 0;

      while (beadSeq.length < targetBeadCount) {
        if (countA < clusterSize || beadSeq.length >= targetBeadCount - 1) {
          beadSeq.push(primaryBead.sku);
          countA++;
        } else {
          beadSeq.push(secondaryBead.sku);
          countA = 0;
        }
      }

      const charmsSkus: Array<{ sku: string; anchorIndex: number }> = [];
      if (matchedCharm) {
        charmsSkus.push({ sku: matchedCharm.sku, anchorIndex: Math.floor(beadSeq.length / 2) });
      }

      proposals.push({
        name: `Rhythmic ${primaryBead.name} & ${secondaryBead.name} Melody`,
        tagline: "Harmonious cluster rhythm balancing both requested gemstones",
        description: `An elegant rhythm of ${primaryBead.name} clustered with periodic ${secondaryBead.name} accents, offering dynamic depth and refined artisan balance.${matchedCharm ? ` Accented with our ${matchedCharm.name}.` : ""}${charmUnavailableNotice}`,
        matchReason: `Delivers a sophisticated ${clusterSize}-to-1 rhythm of your requested colors that feels natural, intentional, and comfortable on a ${params.wristMm}mm wrist.${charmUnavailableNotice}`,
        style: "Rhythmic Designer Clusters",
        occasion: params.occasion || "Versatile Elegance",
        colorTheme: "Harmonious Duet",
        beadSequenceSkus: beadSeq,
        charmsSkus,
      });
    }

    // Style 3: Dual-Tone Yin-Yang Balance (Half-and-Half)
    {
      const half = Math.floor(targetBeadCount / 2);
      const beadSeq: string[] = [
        ...Array(half).fill(primaryBead.sku),
        ...Array(targetBeadCount - half).fill(secondaryBead.sku),
      ];

      const charmsSkus: Array<{ sku: string; anchorIndex: number }> = [];
      if (matchedCharm) {
        charmsSkus.push({ sku: matchedCharm.sku, anchorIndex: half });
      }

      proposals.push({
        name: `${primaryBead.name} & ${secondaryBead.name} Dual-Tone Harmony`,
        tagline: "Equally balanced dual-gemstone composition meeting at the focal center",
        description: `A modern dual-tone layout presenting equal balance between ${primaryBead.name} and ${secondaryBead.name}, meeting seamlessly on the wrist.${matchedCharm ? ` Centered with our ${matchedCharm.name}.` : ""}${charmUnavailableNotice}`,
        matchReason: `Celebrates both ${primaryBead.name} and ${secondaryBead.name} in an equal, clean dual-tone composition tailored for your ${params.wristMm}mm wrist.${charmUnavailableNotice}`,
        style: "Dual-Tone Balance",
        occasion: params.occasion || "Modern Styling",
        colorTheme: "Contrasting Gemstones",
        beadSequenceSkus: beadSeq,
        charmsSkus,
      });
    }
  } else {
    // ------------------------------------------------------------------------
    // CASE B: User requested a single stone/color or pure style
    // ------------------------------------------------------------------------

    // Style 1: Pure Gemstone Signature (100% of the requested stone, no unrelated colors!)
    {
      const beadSeq: string[] = Array(targetBeadCount).fill(primaryBead.sku);
      const charmsSkus: Array<{ sku: string; anchorIndex: number }> = [];
      if (matchedCharm) {
        charmsSkus.push({ sku: matchedCharm.sku, anchorIndex: Math.floor(targetBeadCount / 2) });
      }

      proposals.push({
        name: `Signature Pure ${primaryBead.name}`,
        tagline: `Unbroken monochrome elegance dedicated to the raw beauty of ${primaryBead.name}`,
        description: `A seamless, continuous strand of genuine ${primaryBead.name} beads, calibrated comfortably for your ${params.wristMm}mm wrist.${matchedCharm ? ` Finished with our ${matchedCharm.name}.` : ""}${charmUnavailableNotice}`,
        matchReason: `Directly tailored to your request for ${primaryBead.name}. Formulated with zero distracting filler stones to celebrate pure gemstone character.${charmUnavailableNotice}`,
        style: "Pure Monochrome Luxury",
        occasion: params.occasion || "Everyday Elegance",
        colorTheme: primaryBead.color || "Natural Gemstone",
        beadSequenceSkus: beadSeq,
        charmsSkus,
      });
    }

    // Style 2: Symmetrical Accent Statement (Primary stone with subtle metal/crystal spacer rhythm)
    {
      const beadSeq: string[] = [];
      const spacerInterval = 5;

      for (let i = 0; i < targetBeadCount; i++) {
        if (spacer && i > 0 && i % spacerInterval === 0 && i < targetBeadCount - 2) {
          beadSeq.push(spacer.sku);
        } else {
          beadSeq.push(primaryBead.sku);
        }
      }

      const charmsSkus: Array<{ sku: string; anchorIndex: number }> = [];
      if (matchedCharm) {
        charmsSkus.push({ sku: matchedCharm.sku, anchorIndex: Math.floor(beadSeq.length / 2) });
      }

      proposals.push({
        name: `${primaryBead.name} Artisan Rhythm`,
        tagline: `Polished ${primaryBead.name} paired with delicate artisanal spacer accents`,
        description: `Hand-assembled strand of ${primaryBead.name} accentuated with subtle handcrafted spacers, offering quiet refinement and luminous texture.${matchedCharm ? ` Accented with our ${matchedCharm.name}.` : ""}${charmUnavailableNotice}`,
        matchReason: `Features your requested ${primaryBead.name} as the centerpiece with refined spacer pacing, ideal for ${params.occasion || "any special or daily occasion"}.${charmUnavailableNotice}`,
        style: "Artisan Accented",
        occasion: params.occasion || "Office & Versatile Wear",
        colorTheme: "Gemstone & Metal Accents",
        beadSequenceSkus: beadSeq,
        charmsSkus,
      });
    }

    // Style 3: Symmetrical Focal Trio (Primary stone with 3-bead focal accent)
    {
      const focalStone = secondaryBead.sku !== primaryBead.sku ? secondaryBead : primaryBead;
      const focalCount = 3;
      const sideCount = Math.floor((targetBeadCount - focalCount) / 2);
      const remainder = targetBeadCount - focalCount - sideCount * 2;

      const beadSeq: string[] = [
        ...Array(sideCount).fill(primaryBead.sku),
        ...Array(focalCount).fill(focalStone.sku),
        ...Array(sideCount + remainder).fill(primaryBead.sku),
      ];

      const charmsSkus: Array<{ sku: string; anchorIndex: number }> = [];
      if (matchedCharm) {
        charmsSkus.push({ sku: matchedCharm.sku, anchorIndex: sideCount + 1 });
      }

      proposals.push({
        name: `${primaryBead.name} Centerpiece Focal`,
        tagline: "Classic symmetrical architecture with a hand-selected focal centerpiece",
        description: `Calibrated with a balanced ${focalCount}-bead focal centerpiece centered symmetrically across a primary band of ${primaryBead.name}.${matchedCharm ? ` Highlighted with our ${matchedCharm.name}.` : ""}${charmUnavailableNotice}`,
        matchReason: `Designed to highlight ${primaryBead.name} with symmetrical architectural balance that naturally sits at the front of your wrist.${charmUnavailableNotice}`,
        style: "Symmetrical Focal",
        occasion: params.occasion || "Celebration & Evening",
        colorTheme: "Natural Balance",
        beadSequenceSkus: beadSeq,
        charmsSkus,
      });
    }
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
    params.jewelleryType,
    params.constructionType,
    false, // isAiGenerated = false (catalogue-curated fallback)
    isUnavailableCharmRequested && requestedKeyword ? { requestedKeyword } : undefined
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
  jewelleryType: string,
  constructionType: string,
  isAiGenerated = false,
  unavailableCharm?: { requestedKeyword: string }
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

    // 1b. Automatically calibrate bead count so the sequence precisely fits the target wrist circumference
    if (validatedBeads.length > 0) {
      const avgBeadDiam = estimatedLength / validatedBeads.length || 8;
      const patternToRepeat = [...validatedBeads];
      let pIdx = 0;

      // Expand sequence by repeating the pattern if short of target circumference
      while (
        estimatedLength + (patternToRepeat[pIdx % patternToRepeat.length].diameterMm || 8) <=
          targetCircumference + avgBeadDiam / 2 &&
        validatedBeads.length < maxBeads
      ) {
        const nextBead = patternToRepeat[pIdx % patternToRepeat.length];
        validatedBeads.push({ ...nextBead });
        estimatedLength += nextBead.diameterMm || 8;
        pIdx++;
      }

      // Also ensure minBeads is met
      while (validatedBeads.length < minBeads && patternToRepeat.length > 0) {
        const nextBead = patternToRepeat[pIdx % patternToRepeat.length];
        validatedBeads.push({ ...nextBead });
        estimatedLength += nextBead.diameterMm || 8;
        pIdx++;
      }

      // Trim if it exceeds target circumference and is safely above minBeads
      while (
        validatedBeads.length > minBeads &&
        estimatedLength - (validatedBeads[validatedBeads.length - 1]?.diameterMm || 8) >=
          targetCircumference - avgBeadDiam / 2 &&
        estimatedLength > targetCircumference + avgBeadDiam / 2
      ) {
        const popped = validatedBeads.pop();
        if (popped) estimatedLength -= popped.diameterMm || 8;
      }

      if (validatedBeads.length > maxBeads) {
        validatedBeads.splice(maxBeads);
      }
    }

    // 2. Validate charms
    const validatedCharms: SuggestionCharm[] = [];
    if (!unavailableCharm && Array.isArray(raw.charms)) {
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
        jewelleryType,
        constructionType,
        components: componentInputs,
      });

      let description =
        raw.description ||
        (isAiGenerated
          ? "Designed in consultation with our AI Jewelry Artisan."
          : "Curated handcrafted studio design.");
      let matchReason =
        raw.matchReason ||
        (isAiGenerated
          ? "Curated based on your selected aesthetic and gemstone preferences."
          : "Hand-selected by studio artisans based on your aesthetic preferences.");

      if (unavailableCharm) {
        const notice = ` Note: The requested "${unavailableCharm.requestedKeyword.toUpperCase()}" charm is currently unavailable in our studio catalogue. This arrangement focuses on your requested gemstones without an ungrounded charm substitution.`;
        if (!description.toLowerCase().includes("unavailable")) {
          description += notice;
        }
        if (!matchReason.toLowerCase().includes("unavailable")) {
          matchReason += notice;
        }
      }

      results.push({
        id: `ai_${crypto.randomUUID().slice(0, 8)}`,
        name: raw.name.slice(0, 80),
        tagline: raw.tagline || (isAiGenerated ? "Handcrafted AI bespoke design" : "Handcrafted studio design"),
        description,
        matchReason,
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
