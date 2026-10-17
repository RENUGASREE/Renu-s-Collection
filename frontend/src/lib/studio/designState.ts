// ============================================================================
// DESIGN STATE — pure types and immutable editing operations
// No React dependencies. Can be used with any state management approach.
// ============================================================================

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Safe fallback for environments where randomUUID isn't available
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * A single bead or spacer placement in the elastic bead sequence.
 * diameterMm is resolved from the variant's dimensionsMm.diameterMm at placement
 * time and re-verified against the live catalogue on draft restore.
 */
export interface BeadPlacement {
  instanceId: string;        // Stable UUID, generated at placement
  materialId: string;
  variantSku: string;
  materialType: string;      // "bead" | "stone" | "spacer" (NOT "charm")
  diameterMm: number;        // Physical bead diameter for fit and SVG sizing
  renderAssetUrl?: string;   // Transparent PNG for realistic SVG rendering
  imageUrl: string;          // Fallback thumbnail
  color?: string;            // Free-text color from variant (for CSS fallback)
  finish?: string;
  displayName: string;       // "Material Name · Size Label"
}

/**
 * A charm hangs below a specific anchor bead.
 * Uses anchorInstanceId (stable) so reordering beads doesn't break attachment.
 * When the anchor bead is removed, the charm becomes "orphaned."
 */
export interface CharmAttachment {
  instanceId: string;
  anchorInstanceId: string;  // Points to a BeadPlacement.instanceId
  materialId: string;
  variantSku: string;
  renderAssetUrl?: string;
  imageUrl: string;
  displayName: string;
}

export interface BraceletDesign {
  beadSequence: BeadPlacement[];
  charms: CharmAttachment[];
  /**
   * Charms whose anchor bead was removed.
   * Surfaced as a warning. Undo restores them to attached state.
   */
  orphanedCharms: CharmAttachment[];
  wristMm: number;
  selectedInstanceId: string | null;
}

// ---------------------------------------------------------------------------
// History stack (immutable snapshots — max 50 past states)
// ---------------------------------------------------------------------------

const MAX_HISTORY = 50;

export interface DesignHistory {
  past: BraceletDesign[];
  present: BraceletDesign;
  future: BraceletDesign[];
}

export function makeEmptyDesign(wristMm = 160): BraceletDesign {
  return {
    beadSequence: [],
    charms: [],
    orphanedCharms: [],
    wristMm,
    selectedInstanceId: null,
  };
}

export function makeHistory(design: BraceletDesign): DesignHistory {
  return { past: [], present: design, future: [] };
}

/** Push a new design snapshot. Clears the redo future. */
export function pushHistory(
  history: DesignHistory,
  next: BraceletDesign
): DesignHistory {
  return {
    past: [...history.past.slice(-MAX_HISTORY + 1), history.present],
    present: next,
    future: [],
  };
}

export function undoHistory(history: DesignHistory): DesignHistory {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: DesignHistory): DesignHistory {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

// ---------------------------------------------------------------------------
// Pure editing operations — each returns a new BraceletDesign
// ---------------------------------------------------------------------------

/** Append a bead at the end of the sequence. Preserves selection. */
export function addBeadAtEnd(
  design: BraceletDesign,
  bead: Omit<BeadPlacement, "instanceId">
): BraceletDesign {
  const placement: BeadPlacement = { ...bead, instanceId: generateId() };
  return {
    ...design,
    beadSequence: [...design.beadSequence, placement],
    selectedInstanceId: placement.instanceId,
  };
}

/** Insert a bead before or after the currently selected bead. Falls back to append. */
export function insertBead(
  design: BraceletDesign,
  bead: Omit<BeadPlacement, "instanceId">,
  targetInstanceId: string,
  position: "before" | "after"
): BraceletDesign {
  const idx = design.beadSequence.findIndex(
    (b) => b.instanceId === targetInstanceId
  );
  if (idx === -1) return addBeadAtEnd(design, bead);

  const placement: BeadPlacement = { ...bead, instanceId: generateId() };
  const insertAt = position === "before" ? idx : idx + 1;
  const next = [...design.beadSequence];
  next.splice(insertAt, 0, placement);

  return {
    ...design,
    beadSequence: next,
    selectedInstanceId: placement.instanceId,
  };
}

/** Replace the selected bead with a new one. Keeps the instanceId so charm anchors survive. */
export function replaceBead(
  design: BraceletDesign,
  targetInstanceId: string,
  replacement: Omit<BeadPlacement, "instanceId">
): BraceletDesign {
  const idx = design.beadSequence.findIndex(
    (b) => b.instanceId === targetInstanceId
  );
  if (idx === -1) return design;

  // Re-use the same instanceId so attached charms remain anchored
  const next = [...design.beadSequence];
  next[idx] = { ...replacement, instanceId: targetInstanceId };

  return {
    ...design,
    beadSequence: next,
    selectedInstanceId: targetInstanceId,
  };
}

/**
 * Remove a bead. Any charms anchored to it move to orphanedCharms.
 * A warning is shown in the UI; undo fully restores the state.
 */
export function removeBead(
  design: BraceletDesign,
  targetInstanceId: string
): BraceletDesign {
  const newSequence = design.beadSequence.filter(
    (b) => b.instanceId !== targetInstanceId
  );

  const nowOrphaned = design.charms.filter(
    (c) => c.anchorInstanceId === targetInstanceId
  );
  const remainingCharms = design.charms.filter(
    (c) => c.anchorInstanceId !== targetInstanceId
  );

  // Deselect if we just removed the selected bead
  const newSelected =
    design.selectedInstanceId === targetInstanceId
      ? null
      : design.selectedInstanceId;

  return {
    ...design,
    beadSequence: newSequence,
    charms: remainingCharms,
    orphanedCharms: [...design.orphanedCharms, ...nowOrphaned],
    selectedInstanceId: newSelected,
  };
}

/** Move a bead one position to the left (earlier in sequence). */
export function moveBeadLeft(
  design: BraceletDesign,
  targetInstanceId: string
): BraceletDesign {
  const idx = design.beadSequence.findIndex(
    (b) => b.instanceId === targetInstanceId
  );
  if (idx <= 0) return design;

  const next = [...design.beadSequence];
  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  return { ...design, beadSequence: next };
}

/** Move a bead one position to the right (later in sequence). */
export function moveBeadRight(
  design: BraceletDesign,
  targetInstanceId: string
): BraceletDesign {
  const idx = design.beadSequence.findIndex(
    (b) => b.instanceId === targetInstanceId
  );
  if (idx === -1 || idx >= design.beadSequence.length - 1) return design;

  const next = [...design.beadSequence];
  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
  return { ...design, beadSequence: next };
}

/** Attach a charm to the currently selected bead. */
export function attachCharm(
  design: BraceletDesign,
  charm: Omit<CharmAttachment, "instanceId" | "anchorInstanceId">
): BraceletDesign {
  if (!design.selectedInstanceId) return design;
  // Verify the selected item is actually a bead (not another charm)
  const anchorExists = design.beadSequence.some(
    (b) => b.instanceId === design.selectedInstanceId
  );
  if (!anchorExists) return design;

  const attachment: CharmAttachment = {
    ...charm,
    instanceId: generateId(),
    anchorInstanceId: design.selectedInstanceId,
  };

  return {
    ...design,
    charms: [...design.charms, attachment],
    selectedInstanceId: attachment.instanceId,
  };
}

/** Remove a charm by instanceId. */
export function removeCharm(
  design: BraceletDesign,
  charmInstanceId: string
): BraceletDesign {
  const newSelected =
    design.selectedInstanceId === charmInstanceId
      ? null
      : design.selectedInstanceId;
  return {
    ...design,
    charms: design.charms.filter((c) => c.instanceId !== charmInstanceId),
    orphanedCharms: design.orphanedCharms.filter(
      (c) => c.instanceId !== charmInstanceId
    ),
    selectedInstanceId: newSelected,
  };
}

/** Dismiss (permanently remove) all orphaned charms. */
export function dismissOrphanedCharms(design: BraceletDesign): BraceletDesign {
  return { ...design, orphanedCharms: [] };
}

/** Update wrist size. */
export function setWristMm(
  design: BraceletDesign,
  mm: number
): BraceletDesign {
  return { ...design, wristMm: Math.round(Math.max(100, Math.min(280, mm))) };
}

// ---------------------------------------------------------------------------
// Draft serialisation (localStorage, versioned, no prices stored)
// ---------------------------------------------------------------------------

export const DRAFT_KEY = "studio_bracelet_draft_v2";

export interface BeadDraftItem {
  instanceId: string;
  materialId: string;
  variantSku: string;
}

export interface CharmDraftItem {
  instanceId: string;
  anchorInstanceId: string;
  materialId: string;
  variantSku: string;
}

export interface BraceletDraft {
  version: 2;
  savedAt: string;
  wristMm: number;
  beadSequence: BeadDraftItem[];
  charms: CharmDraftItem[];
}

export function serialiseDraft(design: BraceletDesign): BraceletDraft {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    wristMm: design.wristMm,
    beadSequence: design.beadSequence.map((b) => ({
      instanceId: b.instanceId,
      materialId: b.materialId,
      variantSku: b.variantSku,
    })),
    charms: design.charms.map((c) => ({
      instanceId: c.instanceId,
      anchorInstanceId: c.anchorInstanceId,
      materialId: c.materialId,
      variantSku: c.variantSku,
    })),
  };
}

export function saveDraft(design: BraceletDesign): void {
  try {
    if (design.beadSequence.length === 0 && design.charms.length === 0) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(serialiseDraft(design)));
  } catch {
    // localStorage quota exceeded or private mode — non-fatal
  }
}

export function loadDraftRaw(): BraceletDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 2) return null;
    return parsed as BraceletDraft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
