import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Layers,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  fetchDesignTemplates,
  DesignTemplate,
} from "@/lib/studio/studioApi";
import { getBeadAppearance } from "@/lib/studio/appearance";

interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: DesignTemplate) => void;
}

function TemplateCardVisual({ template }: { template: DesignTemplate }) {
  const [imgFailed, setImgFailed] = useState(false);
  const beadCount = template.beadSequence?.length || 0;

  if (template.thumbnailUrl && !imgFailed) {
    return (
      <div className="w-full h-36 rounded-xl overflow-hidden bg-stone-100 dark:bg-muted mb-3 relative group border border-[#E6D8D0]/60 dark:border-border">
        <img
          src={template.thumbnailUrl}
          alt={template.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  if (beadCount === 0) {
    return (
      <div className="w-full h-36 rounded-xl bg-gradient-to-br from-[#FAF6F2] to-[#EFE7DF] dark:from-muted/40 dark:to-muted/20 flex items-center justify-center mb-3 border border-[#E6D8D0]/60 dark:border-border">
        <Layers className="w-8 h-8 text-[#B66F72]/40" />
      </div>
    );
  }

  const svgSize = 148;
  const center = svgSize / 2;
  const ringRadius = 50;
  const beadRadius = Math.max(3.8, Math.min(8.2, (2 * Math.PI * ringRadius) / (beadCount * 2.35)));

  return (
    <div className="w-full h-36 rounded-xl bg-gradient-to-br from-[#FAF6F2] via-[#F5EEE7] to-[#EBE0D5] dark:from-stone-900/60 dark:via-stone-900/40 dark:to-stone-950/80 flex items-center justify-center mb-3 relative overflow-hidden border border-[#E6D8D0]/80 dark:border-border shadow-inner">
      <svg
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        className="w-32 h-32 drop-shadow-md select-none"
      >
        {/* Elastic ring guide */}
        <circle
          cx={center}
          cy={center}
          r={ringRadius}
          fill="none"
          stroke="rgba(120, 90, 75, 0.22)"
          strokeWidth="1.2"
          strokeDasharray="3 3"
        />

        {/* Gemstone beads */}
        {template.beadSequence.map((b, idx) => {
          const angle = (idx / beadCount) * 2 * Math.PI - Math.PI / 2;
          const cx = center + ringRadius * Math.cos(angle);
          const cy = center + ringRadius * Math.sin(angle);
          const app = getBeadAppearance({
            variantSku: b.variantSku,
            displayName: b.displayName,
            imageUrl: b.imageUrl,
          });

          return (
            <g key={idx}>
              {/* Soft shadow */}
              <circle
                cx={cx}
                cy={cy + 0.6}
                r={beadRadius}
                fill="rgba(0,0,0,0.2)"
              />
              {/* Gemstone body */}
              <circle
                cx={cx}
                cy={cy}
                r={beadRadius}
                fill={app.color}
                stroke="rgba(0,0,0,0.18)"
                strokeWidth="0.6"
              />
              {/* 3D Highlight */}
              <circle
                cx={cx - beadRadius * 0.3}
                cy={cy - beadRadius * 0.3}
                r={beadRadius * 0.38}
                fill="rgba(255,255,255,0.65)"
              />
              {/* Secondary Reflection */}
              <circle
                cx={cx + beadRadius * 0.25}
                cy={cy + beadRadius * 0.25}
                r={beadRadius * 0.2}
                fill="rgba(255,255,255,0.25)"
              />
            </g>
          );
        })}

        {/* Charms if any */}
        {(template.charms || []).map((c, cIdx) => {
          const anchorIdx = template.beadSequence.findIndex(
            (b) => b.variantSku.toUpperCase() === c.anchorVariantSku.toUpperCase()
          );
          const angle = anchorIdx >= 0 ? (anchorIdx / beadCount) * 2 * Math.PI - Math.PI / 2 : Math.PI / 2;
          const dropDist = ringRadius + beadRadius + 6;
          const dropX = center + dropDist * Math.cos(angle);
          const dropY = center + dropDist * Math.sin(angle);

          return (
            <g key={`charm-${cIdx}`}>
              <line
                x1={center + (ringRadius + beadRadius) * Math.cos(angle)}
                y1={center + (ringRadius + beadRadius) * Math.sin(angle)}
                x2={dropX}
                y2={dropY}
                stroke="#B8860B"
                strokeWidth="1"
              />
              <circle cx={dropX} cy={dropY} r={3.6} fill="#DAA520" stroke="#8B6508" strokeWidth="0.8" />
              <text x={dropX} y={dropY + 2.2} fontSize="5.5" textAnchor="middle" fill="#FFFFFF" fontWeight="bold">
                ★
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Center Badge */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[10px] font-mono tracking-wider font-semibold text-[#756861]/80 dark:text-muted-foreground/80 bg-white/75 dark:bg-card/75 px-2 py-0.5 rounded-full border border-stone-200/60 dark:border-border/60 shadow-xs backdrop-blur-xs">
          {beadCount} beads
        </span>
      </div>
    </div>
  );
}

export function TemplateGallery({
  open,
  onOpenChange,
  onSelectTemplate,
}: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDesignTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load starter templates");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#B66F72]/10 dark:bg-primary/10 flex items-center justify-center text-[#B66F72] dark:text-primary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="font-playfair text-xl text-[#342824] dark:text-foreground">
                Starter Design Templates
              </DialogTitle>
              <DialogDescription className="text-xs text-[#756861] dark:text-muted-foreground">
                Choose an artisan-curated base arrangement and customize it freely with your favorite gemstones.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading && (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#B66F72] mb-3" />
            <p className="text-xs text-[#756861] dark:text-muted-foreground">
              Loading curated arrangements…
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 my-4">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium">Could not load templates</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && templates.length === 0 && (
          <div className="py-12 text-center text-xs text-[#756861] dark:text-muted-foreground">
            <Layers className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="font-medium">No templates published yet.</p>
            <p className="mt-1">You can build your custom bracelet from scratch on the canvas!</p>
          </div>
        )}

        {!loading && !error && templates.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {templates.map((tpl) => {
              const beadCount = tpl.beadSequence?.length || 0;
              const charmCount = tpl.charms?.length || 0;
              const hasTestItems = tpl.beadSequence?.some((b) => b.variantSku?.startsWith("TEST-"));

              const uniqueBeadTypes = Array.from(
                new Map(tpl.beadSequence.map((b) => [b.variantSku, b])).values()
              );

              return (
                <div
                  key={tpl._id || tpl.slug}
                  className="rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-background p-4 flex flex-col justify-between hover:border-[#B66F72]/60 transition-all shadow-xs"
                >
                  <div>
                    {/* Visual Product Image or Dynamic Circular Bracelet Render */}
                    <TemplateCardVisual template={tpl} />

                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-playfair font-semibold text-base text-[#342824] dark:text-foreground">
                            {tpl.name}
                          </h4>
                          {hasTestItems && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[9px] font-semibold">
                              Test Arrangement
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase shrink-0 font-medium border-[#E6D8D0]">
                        {tpl.wristMm / 10} cm wrist
                      </Badge>
                    </div>

                    {tpl.description && (
                      <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1 line-clamp-2">
                        {tpl.description}
                      </p>
                    )}

                    {/* Gemstones Breakdown Swatches */}
                    {uniqueBeadTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {uniqueBeadTypes.slice(0, 4).map((b) => {
                          const app = getBeadAppearance({
                            variantSku: b.variantSku,
                            displayName: b.displayName,
                            imageUrl: b.imageUrl,
                          });
                          return (
                            <span
                              key={b.variantSku}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#F4EDE6] dark:bg-muted text-[10px] text-[#5A4B42] dark:text-muted-foreground"
                            >
                              <span
                                className="w-2 h-2 rounded-full inline-block shrink-0 border border-black/15"
                                style={{ backgroundColor: app.color }}
                              />
                              <span className="truncate max-w-[90px]">{b.displayName}</span>
                            </span>
                          );
                        })}
                        {uniqueBeadTypes.length > 4 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{uniqueBeadTypes.length - 4} more
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2 text-[11px] text-[#756861] dark:text-muted-foreground">
                      <span>{beadCount} beads</span>
                      {charmCount > 0 && <span>· {charmCount} charm{charmCount > 1 ? "s" : ""}</span>}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#E6D8D0]/60 dark:border-border/60">
                    <Button
                      size="sm"
                      className="w-full text-xs rounded-lg bg-[#B66F72] hover:bg-[#95565A] text-white"
                      onClick={() => {
                        onSelectTemplate(tpl);
                        onOpenChange(false);
                      }}
                    >
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      <span>Load This Template</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
