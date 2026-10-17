import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import Footer from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Bookmark,
  Sparkles,
  ArrowRight,
  Trash2,
  Edit2,
  Clock,
  Layers,
  ShoppingBag,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  fetchSavedDesigns,
  updateSavedDesign,
  deleteSavedDesign,
  SavedDesign,
} from "@/lib/studio/studioApi";

export default function MyDesignsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rename state
  const [editingDesign, setEditingDesign] = useState<SavedDesign | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login?redirect=/my-designs");
      return;
    }

    loadDesigns();
  }, [user, authLoading, navigate]);

  async function loadDesigns() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSavedDesigns();
      setDesigns(data);
    } catch (err: any) {
      setError(err.message || "Failed to load your saved designs.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDesign || !renameInput.trim()) return;

    setRenaming(true);
    try {
      const updated = await updateSavedDesign(editingDesign._id, {
        name: renameInput.trim(),
      });
      setDesigns((prev) =>
        prev.map((d) => (d._id === updated._id ? { ...d, name: updated.name } : d))
      );
      toast({
        title: "Design Renamed",
        description: `Renamed to "${updated.name}".`,
      });
      setEditingDesign(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not rename",
        description: err.message || "Failed to update design name.",
      });
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this saved design?")) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteSavedDesign(id);
      setDesigns((prev) => prev.filter((d) => d._id !== id));
      toast({
        title: "Design Deleted",
        description: "The design has been removed from your account.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not delete",
        description: err.message || "Failed to delete saved design.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO
        title="My Saved Designs — Renu's Collections"
        description="View and continue editing your bespoke jewellery creations."
      />

      <main className="pt-28 pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-[#E6D8D0] dark:border-border">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#B66F72]/10 text-[#B66F72] dark:text-primary text-xs font-semibold uppercase tracking-wider mb-2">
                <Bookmark className="w-3.5 h-3.5" />
                <span>Bespoke Studio</span>
              </div>
              <h1 className="font-playfair text-3xl sm:text-4xl font-semibold">
                My Saved Designs
              </h1>
              <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
                Your custom jewellery concepts, ready to review, customize, or order.
              </p>
            </div>

            <Link to="/create-your-own/bracelet">
              <Button className="text-xs rounded-xl bg-[#B66F72] hover:bg-[#95565A] text-white flex items-center gap-1.5 shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Open Design Studio</span>
              </Button>
            </Link>
          </div>

          {/* Loading */}
          {loading && (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#B66F72] mb-3" />
              <p className="text-xs text-[#756861] dark:text-muted-foreground">
                Loading your saved creations…
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 my-6">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium">Could not load designs</p>
                <p className="mt-0.5 text-muted-foreground">{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs border-amber-300"
                  onClick={loadDesigns}
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && designs.length === 0 && (
            <div className="py-16 text-center rounded-3xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card p-8">
              <div className="w-14 h-14 rounded-2xl bg-[#B66F72]/10 dark:bg-primary/10 flex items-center justify-center text-[#B66F72] dark:text-primary mx-auto mb-4">
                <Layers className="w-7 h-7" />
              </div>
              <h2 className="font-playfair text-xl font-semibold mb-2">
                No Saved Designs Yet
              </h2>
              <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground max-w-md mx-auto mb-6">
                You haven't saved any custom designs yet. Explore our interactive studio to handpick gemstones, adjust sizes, and craft your signature piece.
              </p>
              <Link to="/create-your-own/bracelet">
                <Button className="rounded-xl text-xs bg-[#B66F72] hover:bg-[#95565A] text-white">
                  <span>Start Designing a Bracelet</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* Design Grid */}
          {!loading && !error && designs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {designs.map((design) => {
                const beadCount = design.beadSequence?.length || 0;
                const charmCount = design.charms?.length || 0;
                const dateStr = new Date(design.updatedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });

                // Get first 5 bead images for mini preview strip
                const previewBeads = design.beadSequence?.slice(0, 7) || [];

                return (
                  <Card
                    key={design._id}
                    className="rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Bead Strip Preview */}
                      <div className="p-4 bg-gradient-to-r from-[#FBF7F3] to-[#F1E6DF] dark:from-muted/40 dark:to-muted/20 border-b border-[#E6D8D0]/60 dark:border-border/60">
                        <div className="flex items-center justify-center gap-1.5 py-3">
                          {previewBeads.map((b, idx) => (
                            <div
                              key={idx}
                              className="w-7 h-7 rounded-full overflow-hidden border border-white dark:border-border shadow-xs bg-stone-200"
                              title={b.displayName}
                            >
                              {b.imageUrl ? (
                                <img
                                  src={b.imageUrl}
                                  alt={b.displayName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-[#B66F72]/20" />
                              )}
                            </div>
                          ))}
                          {beadCount > previewBeads.length && (
                            <span className="text-[10px] font-medium text-[#756861] ml-1">
                              +{beadCount - previewBeads.length}
                            </span>
                          )}
                        </div>
                      </div>

                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-playfair font-semibold text-lg text-[#342824] dark:text-foreground line-clamp-1">
                            {design.name}
                          </h3>
                          <Badge variant="outline" className="text-[10px] font-medium border-[#E6D8D0] shrink-0">
                            {design.wristMm / 10} cm wrist
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-[#756861] dark:text-muted-foreground">
                          <span>{beadCount} beads</span>
                          {charmCount > 0 && <span>· {charmCount} charm(s)</span>}
                          <span>· {dateStr}</span>
                        </div>

                        <div className="pt-2 flex items-baseline justify-between border-t border-[#E6D8D0]/40">
                          <span className="text-[11px] text-[#756861] dark:text-muted-foreground">
                            Provisional Quote:
                          </span>
                          <span className="font-semibold text-sm text-[#B66F72] dark:text-primary">
                            ₹{design.estimatedTotal?.toLocaleString("en-IN") || "—"}
                          </span>
                        </div>
                      </CardContent>
                    </div>

                    <div className="p-4 pt-0 space-y-2">
                      <Link
                        to={`/create-your-own/bracelet?designId=${design._id}`}
                        className="w-full"
                      >
                        <Button className="w-full text-xs rounded-xl bg-[#B66F72] hover:bg-[#95565A] text-white flex items-center justify-center gap-1.5">
                          <span>Open in Designer</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs rounded-lg border-[#E6D8D0] text-[#756861] hover:bg-[#FBF7F3]"
                          onClick={() => {
                            setEditingDesign(design);
                            setRenameInput(design.name);
                          }}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          <span>Rename</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingId === design._id}
                          className="text-xs rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                          onClick={() => handleDelete(design._id)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Rename Dialog */}
      <Dialog
        open={!!editingDesign}
        onOpenChange={(open) => !open && setEditingDesign(null)}
      >
        <DialogContent className="sm:max-w-md bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border">
          <DialogHeader>
            <DialogTitle className="font-playfair text-xl text-[#342824] dark:text-foreground">
              Rename Saved Design
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRename} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="rename-input" className="text-xs font-medium">
                Design Name
              </Label>
              <Input
                id="rename-input"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                maxLength={80}
                className="bg-white dark:bg-background border-[#E6D8D0]"
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 text-xs border-[#E6D8D0]"
                onClick={() => setEditingDesign(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={renaming || !renameInput.trim()}
                className="flex-1 text-xs bg-[#B66F72] hover:bg-[#95565A] text-white"
              >
                {renaming ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
