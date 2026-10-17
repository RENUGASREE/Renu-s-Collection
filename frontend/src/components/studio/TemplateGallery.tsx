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

interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: DesignTemplate) => void;
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

              return (
                <div
                  key={tpl._id || tpl.slug}
                  className="rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-background p-4 flex flex-col justify-between hover:border-[#B66F72]/60 transition-all shadow-xs"
                >
                  <div>
                    {tpl.thumbnailUrl ? (
                      <div className="w-full h-32 rounded-lg overflow-hidden bg-stone-100 dark:bg-muted mb-3">
                        <img
                          src={tpl.thumbnailUrl}
                          alt={tpl.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-24 rounded-lg bg-gradient-to-br from-[#F5ECE5] to-[#EBDCD0] dark:from-muted/40 dark:to-muted/20 flex items-center justify-center mb-3">
                        <Layers className="w-8 h-8 text-[#B66F72]/40" />
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-playfair font-semibold text-base text-[#342824] dark:text-foreground">
                        {tpl.name}
                      </h4>
                      <Badge variant="outline" className="text-[10px] uppercase shrink-0 font-medium border-[#E6D8D0]">
                        {tpl.wristMm / 10} cm wrist
                      </Badge>
                    </div>

                    {tpl.description && (
                      <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1 line-clamp-2">
                        {tpl.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-3 text-[11px] text-[#756861] dark:text-muted-foreground">
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
