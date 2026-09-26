import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
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
import { Check, X, Star, Calendar, User, Package, Trash2 } from "lucide-react";

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

    const fetchReviews = async () => {
      try {
        const response = await apiRequest('GET', '/api/v1/reviews/admin/all');
        const data = await response.json();
        // Ensure each review has a unique key
        const reviewsWithKeys = (data.data || []).map((review: any, idx: number) => ({
          ...review,
          _key: review._key || review.id || `review-${idx}`,
        }));
        setReviews(reviewsWithKeys);
      } catch (err: any) {
        setError(err.message || 'Failed to load reviews');
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [token, user]);

  const handleApprove = async (reviewId: string) => {
    try {
      const response = await apiRequest('POST', `/api/v1/reviews/${reviewId}/approve`);
      const data = await response.json();
      if (data.success) {
        setReviews(reviews.map(r => r.id === reviewId ? { ...r, isApproved: true } : r));
        toast({
          title: "Review Approved",
          description: "Review is now published and visible to customers.",
        });
      }
    } catch (err: any) {
      console.error('Error approving review:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to approve review",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (reviewId: string) => {
    try {
      const response = await apiRequest('POST', `/api/v1/reviews/${reviewId}/reject`);
      const data = await response.json();
      if (data.success) {
        setReviews(reviews.map(r => r.id === reviewId ? { ...r, isApproved: false } : r));
        toast({
          title: "Review Rejected",
          description: "Review status updated to unapproved.",
        });
      }
    } catch (err: any) {
      console.error('Error rejecting review:', err);
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
      const response = await apiRequest('DELETE', `/api/v1/reviews/${deletingReviewId}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setReviews((prev) => prev.filter((r) => r.id !== deletingReviewId));
        toast({
          title: "Review Deleted",
          description: "Review removed and product rating statistics recalculated.",
        });
        setDeletingReviewId(null);
      } else {
        throw new Error(data.message || "Failed to delete review");
      }
    } catch (err: any) {
      console.error('Error deleting review:', err);
      toast({
        title: "Deletion Failed",
        description: err.message || "Could not delete review. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SEO title="Review Management - Admin" noindex />
        <main className="container mx-auto px-4 py-8 pt-20">
          <div className="text-center text-xl">Loading reviews...</div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SEO title="Review Management - Admin" noindex />
        <main className="container mx-auto px-4 py-8 pt-20">
          <div className="text-center">
            <p className="text-xl text-destructive mb-6">{error}</p>
            <Button asChild>
              <Link to="/admin">Back to Admin Dashboard</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const pendingReviews = reviews.filter(r => !r.isApproved);
  const approvedReviews = reviews.filter(r => r.isApproved);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO title="Review Management - Admin" noindex />
      <main className="container mx-auto px-4 py-8 pt-20">
        <div className="mb-8">
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
            ← Back to Admin Dashboard
          </Link>
          <h1 className="text-4xl font-bold mb-2">Review Management</h1>
          <p className="text-muted-foreground">
            {pendingReviews.length} pending reviews, {approvedReviews.length} approved
          </p>
        </div>

        {/* Pending Reviews */}
        {pendingReviews.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Pending Reviews</h2>
            <div className="space-y-4">
              {pendingReviews.map((review) => (
                <Card key={review._key || review.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">
                            Pending
                          </Badge>
                          {review.isVerifiedPurchase && (
                            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                              <Check className="h-3 w-3 mr-1" />
                              Verified Purchase
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg">{review.title}</CardTitle>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {review.username}
                          </div>
                          <div className="flex items-center gap-1">
                            <Package className="h-4 w-4" />
                            Product: {getProductName(review.productId)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(review.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-5 w-5 ${
                              i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-4">{review.body}</p>
                    {review.images.length > 0 && (
                      <div className="flex gap-2 mb-4">
                        {review.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`Review image ${idx + 1}`}
                            className="w-20 h-20 object-cover rounded"
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(review.id)}
                          className="bg-green-600 hover:bg-green-700 h-8 text-xs"
                        >
                          <Check className="h-3.5 w-3.5 mr-1.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(review.id)}
                          className="h-8 text-xs"
                        >
                          <X className="h-3.5 w-3.5 mr-1.5" />
                          Reject
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingReviewId(review.id)}
                        className="text-destructive hover:bg-destructive/10 h-8 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Approved Reviews */}
        {approvedReviews.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Approved Reviews</h2>
            <div className="space-y-4">
              {approvedReviews.map((review) => (
                <Card key={review._key || review.id} className="opacity-90">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                            <Check className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                          {review.isVerifiedPurchase && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
                              Verified Purchase
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg">{review.title}</CardTitle>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {review.username}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(review.createdAt).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1">
                            Helpful: {review.helpfulCount}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-5 w-5 ${
                              i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-4">{review.body}</p>
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(review.id)}
                        className="h-8 text-xs"
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Unapprove
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingReviewId(review.id)}
                        className="text-destructive hover:bg-destructive/10 h-8 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {reviews.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">No reviews found</p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingReviewId} onOpenChange={(open) => !open && setDeletingReviewId(null)}>
        <AlertDialogContent className="rounded-xl border border-border/60 bg-background/95 backdrop-blur-md shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-lg tracking-tight">Delete Customer Review?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              This action cannot be undone. The review will be permanently deleted and the piece's average rating and total review counts will automatically recalculate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex gap-2">
            <AlertDialogCancel disabled={isDeleting} className="rounded-lg text-xs h-9">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg text-xs h-9 px-4"
            >
              {isDeleting ? "Deleting..." : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
}
