import { useEffect, useState } from "react";
import Footer from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, formatApiErrorMessage } from "@/lib/queryClient";
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
  const [deletingReview, setDeletingReview] = useState<Review | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');

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
      setError(null);
      const response = await apiRequest("GET", "/api/v1/reviews/admin/all");
      
      if (!response.ok) {
        throw new Error(`Failed to load reviews (${response.status})`);
      }
      
      const json = await response.json();
      setReviews(json.data || []);
    } catch (err: any) {
      const msg = formatApiErrorMessage(err);
      setError(msg);
      toast({
        title: "Error Loading Reviews",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (reviewId: string) => {
    try {
      const response = await apiRequest("POST", `/api/v1/reviews/${reviewId}/approve`);
      if (!response.ok) throw new Error("Approval failed");
      
      setReviews(prev => prev.map(r => ((r.id || (r as any)._id) === reviewId ? { ...r, isApproved: true } : r)));
      toast({
        title: "Review Approved",
        description: "The review is now publicly visible on the product page.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: formatApiErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  const handleReject = async (reviewId: string) => {
    try {
      const response = await apiRequest("POST", `/api/v1/reviews/${reviewId}/reject`);
      if (!response.ok) throw new Error("Rejection failed");
      
      setReviews(prev => prev.map(r => ((r.id || (r as any)._id) === reviewId ? { ...r, isApproved: false } : r)));
      toast({
        title: "Review Rejected / Unapproved",
        description: "The review is now hidden from public view.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: formatApiErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingReview) return;
    const reviewId = deletingReview.id || (deletingReview as any)._id;
    if (!reviewId) return;

    setIsDeleting(true);
    try {
      const response = await apiRequest("DELETE", `/api/v1/reviews/${reviewId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Delete failed");
      }
      
      setReviews(prev => prev.filter(r => (r.id || (r as any)._id) !== reviewId));
      toast({
        title: "Review Deleted",
        description: "Review permanently removed and product rating statistics recalculated.",
      });
      setDeletingReview(null);
    } catch (err: any) {
      toast({
        title: "Deletion Failed",
        description: formatApiErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const pendingReviews = reviews.filter(r => !r.isApproved);
  const approvedReviews = reviews.filter(r => r.isApproved);

  const displayedReviews = 
    activeTab === 'pending' ? pendingReviews :
    activeTab === 'approved' ? approvedReviews :
    reviews;

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Review Moderation - Renu's Collections Admin" noindex />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-6xl">
        <AdminNav className="mb-6" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-6">
          <div>
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Quality & Trust</span>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground mt-0.5">
              Review Moderation
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Audit customer feedback, approve ratings, or delete outdated/test reviews.
            </p>
          </div>

          <Button 
            onClick={fetchReviews}
            variant="outline" 
            size="sm"
            disabled={loading}
            className="border-[#E6D8D0] dark:border-border text-xs rounded-xl flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Tabs for Moderation */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-[#B66F72] text-white shadow-xs'
                : 'bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50'
            }`}
          >
            <span>Pending Moderation</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'pending' ? 'bg-white/20 text-white' : 'bg-[#B66F72]/10 text-[#B66F72]'
            }`}>
              {pendingReviews.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('approved')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === 'approved'
                ? 'bg-[#B66F72] text-white shadow-xs'
                : 'bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50'
            }`}
          >
            <span>Approved Reviews</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'approved' ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-600'
            }`}>
              {approvedReviews.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === 'all'
                ? 'bg-[#B66F72] text-white shadow-xs'
                : 'bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50'
            }`}
          >
            <span>All Reviews</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-stone-100 dark:bg-muted text-stone-600'
            }`}>
              {reviews.length}
            </span>
          </button>
        </div>

        {/* Review list */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#756861] dark:text-muted-foreground">Loading reviews...</p>
          </div>
        ) : displayedReviews.length === 0 ? (
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl p-8 text-center max-w-md mx-auto">
            <Star className="w-12 h-12 text-[#B99A72] mx-auto mb-3 opacity-60" />
            <h3 className="font-playfair text-xl font-semibold mb-1">
              {activeTab === 'pending' ? 'Queue Clear' : activeTab === 'approved' ? 'No Approved Reviews' : 'No Reviews Found'}
            </h3>
            <p className="text-xs text-[#756861] dark:text-muted-foreground">
              {activeTab === 'pending'
                ? 'There are no reviews currently awaiting moderation.'
                : activeTab === 'approved'
                ? 'No published reviews exist yet.'
                : 'Customer feedback will appear here.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {displayedReviews.map((r, idx) => {
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
                        {r.isApproved ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                            Approved
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200">
                            Pending Moderation
                          </span>
                        )}
                        {r.isVerifiedPurchase && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200">
                            Verified Purchase
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 text-xs text-[#756861] dark:text-muted-foreground flex-wrap">
                        <span>By: <strong className="text-[#342824] dark:text-foreground">{r.username}</strong></span>
                        {pName && <span>Piece: <strong className="text-[#342824] dark:text-foreground">{pName}</strong></span>}
                        {r.createdAt && (
                          <span className="flex items-center gap-1 text-[11px]">
                            <Calendar className="w-3 h-3 text-[#B99A72]" />
                            {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!r.isApproved ? (
                        <Button
                          size="sm"
                          onClick={() => handleApprove(reviewId)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg h-8 px-3"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          <span>Approve</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(reviewId)}
                          className="border-[#E6D8D0] dark:border-border text-xs rounded-lg h-8 px-3 text-[#756861]"
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          <span>Unapprove</span>
                        </Button>
                      )}

                      {!r.isApproved && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(reviewId)}
                          className="border-[#E6D8D0] dark:border-border text-xs rounded-lg h-8 px-3"
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          <span>Reject</span>
                        </Button>
                      )}

                      {/* Delete action available for BOTH pending and approved reviews */}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeletingReview(r)}
                        className="text-xs rounded-lg h-8 px-2.5 flex items-center gap-1"
                        title="Delete review"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    </div>
                  </div>

                  {/* Review Content */}
                  <div className="pt-4 text-xs sm:text-sm text-[#756861] dark:text-muted-foreground leading-relaxed">
                    <p>{r.body}</p>
                    {r.images && r.images.length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
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

        {/* Delete Confirmation Alert identifying the exact review */}
        <AlertDialog open={!!deletingReview} onOpenChange={(open) => !open && !isDeleting && setDeletingReview(null)}>
          <AlertDialogContent className="rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-lg text-[#342824] dark:text-foreground">
                Permanently Delete Review?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-2 text-xs text-[#756861] dark:text-muted-foreground">
                  <p>
                    This action is permanent and cannot be undone. Product average rating and total review counts will automatically recalculate.
                  </p>
                  {deletingReview && (
                    <div className="p-3 rounded-lg border border-[#E6D8D0]/80 dark:border-border bg-[#FBF7F3] dark:bg-muted/30 space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#342824] dark:text-foreground">Title:</span>
                        <span className="italic">"{deletingReview.title}"</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#342824] dark:text-foreground">Reviewer:</span>
                        <span>{deletingReview.username}</span>
                        <span className="text-[#B99A72]">({deletingReview.rating} ★)</span>
                      </div>
                      {getProductName(deletingReview.productId) && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#342824] dark:text-foreground">Piece:</span>
                          <span>{getProductName(deletingReview.productId)}</span>
                        </div>
                      )}
                      <div className="pt-1 text-[11px] text-[#756861]/80 dark:text-muted-foreground/80 line-clamp-2">
                        "{deletingReview.body}"
                      </div>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel disabled={isDeleting} className="text-xs rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete} 
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-lg"
              >
                {isDeleting ? "Deleting..." : "Permanently Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
      <Footer />
    </div>
  );
}
