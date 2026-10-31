import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { StarRating } from './star-rating';
import { apiRequest, getAssetUrl } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, ThumbsUp, Trash2, Image as ImageIcon, Video, ZoomIn } from 'lucide-react';

interface Review {
  id: string;
  userId: string;
  username: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  isApproved: boolean;
  images: string[];
  helpfulCount: number;
}

interface ReviewListProps {
  productId: string;
  refreshTrigger?: number;
}

export function ReviewList({ productId, refreshTrigger }: ReviewListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    fetchReviews();
  }, [productId, page, refreshTrigger]);

  const fetchReviews = async () => {
    if (!productId) {
      setReviews([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await apiRequest('GET', `/api/v1/reviews?productId=${encodeURIComponent(productId)}&page=${page}&limit=10`);
      if (!response.ok) {
        setReviews([]);
        setTotal(0);
        return;
      }
      const data = await response.json();
      setReviews(data?.data?.reviews || []);
      setTotal(data?.data?.total || 0);
    } catch {
      setReviews([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkHelpful = async (reviewId: string) => {
    try {
      await apiRequest('POST', `/api/v1/reviews/${reviewId}/helpful`);
      setReviews(
        reviews.map((review) =>
          review.id === reviewId
            ? { ...review, helpfulCount: review.helpfulCount + 1 }
            : review
        )
      );
      toast({
        title: 'Thank you',
        description: 'Review marked as helpful',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to mark review as helpful',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;

    try {
      await apiRequest('DELETE', `/api/v1/reviews/${reviewId}`);
      setReviews(reviews.filter((review) => review.id !== reviewId));
      toast({
        title: 'Success',
        description: 'Review deleted successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete review',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm tracking-wide">
        <span className="inline-block animate-pulse">Loading reviews...</span>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-10 text-center bg-card/40 backdrop-blur-sm">
        <p className="text-muted-foreground font-serif text-base mb-1">No reviews yet</p>
        <p className="text-xs text-muted-foreground/70">Be the first to share your experience with this handcrafted piece.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <Card key={review.id} className="border border-border/50 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 rounded-xl overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-xs border border-primary/20 shrink-0">
                    {review.username ? review.username.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="font-medium text-foreground text-sm tracking-tight">{review.username}</span>
                  {review.isVerifiedPurchase && (
                    <Badge variant="outline" className="text-[11px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-medium px-2 py-0.5">
                      <CheckCircle className="h-3 w-3 mr-1 text-amber-600 dark:text-amber-400" />
                      Verified Purchase
                    </Badge>
                  )}
                </div>
                <StarRating rating={review.rating} size={15} showValue />
                <h4 className="font-serif font-medium text-foreground tracking-tight text-base mt-2">{review.title}</h4>
              </div>
              <span className="text-xs text-muted-foreground/75 whitespace-nowrap pt-1">
                {new Date(review.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-foreground/85 leading-relaxed font-sans mb-4">{review.body}</p>

            {/* Media */}
            {review.images && review.images.length > 0 && (
              <div className="flex flex-wrap gap-2.5 mb-4">
                {review.images.map((image, index) => (
                  <div key={index} className="relative group overflow-hidden rounded-lg border border-border/50 shadow-sm bg-muted/20">
                    {image.match(/\.(mp4|webm|ogg)$/i) ? (
                      <video
                        src={getAssetUrl(image)}
                        controls
                        className="w-20 h-20 object-cover"
                      />
                    ) : (
                      <button
                        type="button"
                        className="relative w-20 h-20 block cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-lg text-left"
                        onClick={() => setActiveLightboxImage(getAssetUrl(image))}
                        title="Click to view enlarged image"
                      >
                        <img
                          src={getAssetUrl(image)}
                          alt={`Review media ${index + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 flex items-center justify-center transition-colors">
                          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                        </div>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-border/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleMarkHelpful(review.id)}
                className="text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full px-3 h-8"
              >
                <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                Helpful ({review.helpfulCount})
              </Button>

              {user && user.id === review.userId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteReview(review.id)}
                  className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-full px-3 h-8 ml-auto"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Pagination */}
      {total > 10 && (
        <div className="flex justify-center items-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-full text-xs"
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground px-3">
            Page {page} of {Math.ceil(total / 10)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 10)}
            className="rounded-full text-xs"
          >
            Next
          </Button>
        </div>
      )}

      {/* Lightbox Dialog for Review Photos */}
      <Dialog open={!!activeLightboxImage} onOpenChange={(open) => !open && setActiveLightboxImage(null)}>
        <DialogContent className="max-w-3xl p-3 sm:p-4 bg-background/95 backdrop-blur border-border/60 overflow-hidden shadow-2xl">
          <DialogTitle className="text-sm font-medium text-muted-foreground sr-only">
            Enlarged Customer Review Photo
          </DialogTitle>
          {activeLightboxImage && (
            <div className="flex items-center justify-center max-h-[80vh] w-full overflow-hidden rounded-md bg-black/40">
              <img
                src={activeLightboxImage}
                alt="Enlarged review photo"
                className="max-h-[75vh] w-auto max-w-full object-contain rounded"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
