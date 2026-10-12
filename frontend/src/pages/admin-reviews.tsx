import { useEffect, useState } from "react";
import Footer from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
import AdminNav from "@/components/AdminNav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, X, Star, Calendar, User, Package, Trash2, RefreshCw } from "lucide-react";

interface Review {
  id: string;
  userId: any;
  username: string;
  productId: string | { _id: string; name: string };
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  createdAt: string;
  images: string[];
  helpfulCount: number;
  _key?: string;
}

function getProductName(productId: Review['productId']): string {
  if (!productId) return '';
  if (typeof productId === 'object') {
    return productId.name || productId._id || '';
  }
  return String(productId);
}

export default function AdminReviews() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!token || user?.role !== 'admin') {
      setError('Admin access required');
      setLoading(false);
      return;
    }
    fetchReviews();
  }, [token, user]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await apiRequest("GET", "/api/v1/reviews/admin/pending");
      
      if (!response.ok) {
        throw new Error(`Failed to load reviews (${response.status})`);
      }
      
      const json = await response.json();
      setReviews(json.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (reviewId: string) => {
    try {
      const response = await apiRequest("PATCH", `/api/v1/reviews/admin/${reviewId}/approve`);
      if (!response.ok) throw new Error("Approval failed");
      
      setReviews(prev => prev.filter(r => (r.id || (r as any)._id) !== reviewId));
      toast({
        title: "Review Approved",
        description: "The review is now publicly visible on the product page.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to approve review",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (reviewId: string) => {
    try {
      const response = await apiRequest("PATCH", `/api/v1/reviews/admin/${reviewId}/reject`);
      if (!response.ok) throw new Error("Rejection failed");
      
      setReviews(prev => prev.filter(r => (r.id || (r as any)._id) !== reviewId));
      toast({
        title: "Review Rejected",
        description: "The review has been rejected and will remain hidden.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to reject review",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingReviewId) return;
    setIsDeleting(true);
    try {
      const response = await apiRequest("DELETE", `/api/v1/reviews/admin/${deletingReviewId}`);
      if (!response.ok) throw new Error("Delete failed");
      
      setReviews(prev => prev.filter(r => (r.id || (r as any)._id) !== deletingReviewId));
      toast({
        title: "Review Deleted",
        description: "Review permanently removed.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete review",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeletingReviewId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Review Moderation - Renu's Collections Admin" noindex />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-6xl">
        <AdminNav className="mb-6" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-8">
          <div>
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Quality & Trust</span>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground mt-0.5">
              Review Moderation
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Audit customer feedback, ratings, and attached photos before publishing.
            </p>
          </div>

          <Button 
            onClick={fetchReviews}
            variant="outline" 
            size="sm"
            className="border-[#E6D8D0] dark:border-border text-xs rounded-xl flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Review list */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#756861] dark:text-muted-foreground">Loading pending reviews...</p>
          </div>
        ) : reviews.length === 0 ? (
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl p-8 text-center max-w-md mx-auto">
            <Star className="w-12 h-12 text-[#B99A72] mx-auto mb-3 opacity-60" />
            <h3 className="font-playfair text-xl font-semibold mb-1">Queue Clear</h3>
            <p className="text-xs text-[#756861] dark:text-muted-foreground">There are no reviews currently awaiting moderation.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {reviews.map((r, idx) => {
              const reviewId = r.id || (r as any)._id || `review-${idx}`;
              const pName = getProductName(r.productId);

              return (
                <Card 
                  key={reviewId}
                  className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl p-5 shadow-xs hover:shadow-sm transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#E6D8D0]/60 dark:border-border/60">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-0.5 text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star 
                              key={i} 
                              className={`w-4 h-4 ${i < r.rating ? 'fill-current' : 'text-stone-300 dark:text-stone-700'}`} 
                            />
                          ))}
                        </div>
                        <h3 className="font-playfair font-semibold text-base text-[#342824] dark:text-foreground">
                          {r.title}
                        </h3>
                        {r.isVerifiedPurchase && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                            Verified Purchase
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs text-[#756861] dark:text-muted-foreground">
                        <span>By: <strong className="text-[#342824] dark:text-foreground">{r.username}</strong></span>
                        {pName && <span>Product: <strong className="text-[#342824] dark:text-foreground">{pName}</strong></span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(reviewId)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg h-8 px-3"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        <span>Approve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(reviewId)}
                        className="border-[#E6D8D0] dark:border-border text-xs rounded-lg h-8 px-3"
                      >
                        <X className="w-3.5 h-3.5 mr-1" />
                        <span>Reject</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeletingReviewId(reviewId)}
                        className="text-xs rounded-lg h-8 px-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Review Content */}
                  <div className="pt-4 text-xs sm:text-sm text-[#756861] dark:text-muted-foreground leading-relaxed">
                    <p>{r.body}</p>
                    {r.images && r.images.length > 0 && (
                      <div className="flex gap-2 mt-3">
                        {r.images.map((img, iIdx) => (
                          <img 
                            key={iIdx} 
                            src={img} 
                            alt="Review attachment" 
                            className="w-14 h-14 object-cover rounded-lg border border-[#E6D8D0] dark:border-border"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Delete Confirmation Alert */}
        <AlertDialog open={!!deletingReviewId} onOpenChange={(open) => !open && setDeletingReviewId(null)}>
          <AlertDialogContent className="rounded-xl border border-[#E6D8D0] dark:border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-lg">Permanently Delete Review?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#756861] dark:text-muted-foreground">
                This action cannot be undone. This review will be permanently deleted from the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs rounded-lg">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-lg">
                Delete Review
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
      <Footer />
    </div>
  );
}
