import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingBag,
  Bookmark,
  Check,
  Loader2,
  Lock,
  ArrowRight,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  saveDesign,
  addCustomDesignToCart,
  SavedDesignBead,
  SavedDesignCharm,
} from "@/lib/studio/studioApi";
import { BeadPlacement, CharmAttachment } from "@/lib/studio/designState";

interface AddToCartPanelProps {
  wristMm: number;
  beads: BeadPlacement[];
  charms: CharmAttachment[];
  quoteTotalPrice: number;
  minComponents: number;
  maxComponents: number;
  currentDesignName?: string;
  savedDesignId?: string;
  onSaved?: (savedId: string, name: string) => void;
}

export function AddToCartPanel({
  wristMm,
  beads,
  charms,
  quoteTotalPrice,
  minComponents,
  maxComponents,
  currentDesignName = "My Custom Bracelet",
  savedDesignId,
  onSaved,
}: AddToCartPanelProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  // Dialogs
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [designNameInput, setDesignNameInput] = useState(currentDesignName);
  const [showAddedDialog, setShowAddedDialog] = useState(false);
  const [addedItemName, setAddedItemName] = useState("");

  const beadCount = beads.length;
  const isComponentCountValid =
    beadCount >= minComponents && beadCount <= maxComponents;

  // Convert client state to API payload structures
  function getBeadSequencePayload(): SavedDesignBead[] {
    return beads.map((b) => ({
      materialId: b.materialId,
      variantSku: b.variantSku,
      displayName: b.displayName,
      diameterMm: b.diameterMm,
      imageUrl: b.imageUrl,
    }));
  }

  function getCharmsPayload(): SavedDesignCharm[] {
    return charms.map((c) => ({
      instanceId: c.instanceId,
      anchorInstanceId: c.anchorInstanceId,
      materialId: c.materialId,
      variantSku: c.variantSku,
      displayName: c.displayName,
      imageUrl: c.imageUrl,
    }));
  }

  async function handleSaveDesign(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      navigate("/login");
      return;
    }
    const name = designNameInput.trim() || "My Custom Bracelet";
    setSaving(true);

    try {
      const saved = await saveDesign({
        name,
        jewelleryType: "bracelet",
        constructionType: "elastic_bead",
        wristMm,
        beadSequence: getBeadSequencePayload(),
        charms: getCharmsPayload(),
        estimatedTotal: quoteTotalPrice,
      });

      setShowSaveDialog(false);
      if (onSaved) onSaved(saved._id, saved.name);

      toast({
        title: "Design Saved",
        description: `"${saved.name}" has been saved to your account.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not save design",
        description: err.message || "An error occurred while saving your design.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddToCart() {
    if (!user) {
      navigate("/login");
      return;
    }

    if (!isComponentCountValid) {
      toast({
        variant: "destructive",
        title: "Adjust component count",
        description: `This bracelet requires between ${minComponents} and ${maxComponents} beads (currently ${beadCount}).`,
      });
      return;
    }

    setAddingToCart(true);
    const designName = designNameInput.trim() || currentDesignName || "Custom Elastic Bead Bracelet";

    try {
      await addCustomDesignToCart({
        savedDesignId,
        name: designName,
        jewelleryType: "bracelet",
        constructionType: "elastic_bead",
        wristMm,
        quantity: 1,
        beadSequence: getBeadSequencePayload(),
        charms: getCharmsPayload(),
      });

      setAddedItemName(designName);
      setShowAddedDialog(true);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not add to cart",
        description: err.message || "An error occurred while adding design to cart.",
      });
    } finally {
      setAddingToCart(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card p-5 space-y-3.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
            Complete Creation
          </span>
          <span className="text-xs font-semibold text-[#B66F72] dark:text-primary">
            ₹{quoteTotalPrice.toLocaleString("en-IN")}
          </span>
        </div>

        {!isComponentCountValid && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Bracelet has {beadCount} beads. Recommended: {minComponents} to {maxComponents} beads for proper fit.
            </span>
          </div>
        )}

        {!user ? (
          <div className="p-3 rounded-xl bg-[#FBF7F3] dark:bg-muted/40 border border-[#E6D8D0] dark:border-border text-center space-y-2">
            <p className="text-xs text-[#756861] dark:text-muted-foreground">
              Sign in to save your design or add it to your shopping bag.
            </p>
            <Button
              size="sm"
              className="w-full text-xs rounded-xl bg-[#B66F72] hover:bg-[#95565A] text-white"
              onClick={() => navigate("/login")}
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              <span>Sign In to Continue</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              className="w-full text-xs rounded-xl bg-[#B66F72] hover:bg-[#95565A] text-white font-medium py-2.5 shadow-xs flex items-center justify-center gap-2"
              disabled={!isComponentCountValid || addingToCart}
              onClick={handleAddToCart}
            >
              {addingToCart ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Adding to Shopping Bag…</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Add to Shopping Bag</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full text-xs rounded-xl border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#FBF7F3] dark:hover:bg-muted py-2 flex items-center justify-center gap-1.5"
              disabled={beadCount === 0 || saving}
              onClick={() => {
                setDesignNameInput(currentDesignName || "My Custom Bracelet");
                setShowSaveDialog(true);
              }}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Save to My Designs</span>
            </Button>
          </div>
        )}
      </div>

      {/* Save Design Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border">
          <DialogHeader>
            <DialogTitle className="font-playfair text-xl text-[#342824] dark:text-foreground">
              Save Your Design
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756861] dark:text-muted-foreground">
              Give your bespoke creation a name to easily find and order it later from "My Designs".
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveDesign} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="design-name" className="text-xs font-medium">
                Design Name
              </Label>
              <Input
                id="design-name"
                value={designNameInput}
                onChange={(e) => setDesignNameInput(e.target.value)}
                maxLength={80}
                placeholder="e.g. Rose Quartz Elegance"
                className="bg-white dark:bg-background border-[#E6D8D0] dark:border-border"
                autoFocus
              />
            </div>

            <div className="text-[11px] text-[#756861] dark:text-muted-foreground space-y-1 bg-white/60 dark:bg-background/40 p-2.5 rounded-lg border border-[#E6D8D0]">
              <div className="flex justify-between">
                <span>Wrist circumference:</span>
                <span className="font-medium">{wristMm / 10} cm</span>
              </div>
              <div className="flex justify-between">
                <span>Components:</span>
                <span className="font-medium">{beadCount} beads {charms.length > 0 && `· ${charms.length} charm(s)`}</span>
              </div>
              <div className="flex justify-between">
                <span>Provisional Quote:</span>
                <span className="font-semibold text-[#B66F72] dark:text-primary">₹{quoteTotalPrice.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 text-xs border-[#E6D8D0]"
                onClick={() => setShowSaveDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !designNameInput.trim()}
                className="flex-1 text-xs bg-[#B66F72] hover:bg-[#95565A] text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Save Design</span>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Added to Cart Confirmation Dialog */}
      <Dialog open={showAddedDialog} onOpenChange={setShowAddedDialog}>
        <DialogContent className="sm:max-w-md bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border text-center">
          <div className="mx-auto my-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Check className="h-6 w-6" />
          </div>

          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="font-playfair text-xl text-[#342824] dark:text-foreground">
              Added to Your Shopping Bag!
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
              "{addedItemName}" has been placed in your bag with your customized bead sequence and wrist fit.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
            <Button
              variant="outline"
              className="flex-1 text-xs border-[#E6D8D0] dark:border-border text-[#756861]"
              onClick={() => setShowAddedDialog(false)}
            >
              Continue Designing
            </Button>
            <Button
              className="flex-1 text-xs bg-[#B66F72] hover:bg-[#95565A] text-white flex items-center justify-center gap-1.5"
              onClick={() => {
                setShowAddedDialog(false);
                navigate("/cart");
              }}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>View Shopping Bag</span>
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
