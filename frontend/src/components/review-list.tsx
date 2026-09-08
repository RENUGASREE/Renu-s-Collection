import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StarRating } from './star-rating';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, ThumbsUp, Trash2, Image as ImageIcon, Video } from 'lucide-react';

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
}

export function ReviewList({ productId }: ReviewListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchReviews();
  }, [productId, page]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', `/api/v1/reviews?productId=${productId}&page=${page}&limit=10`);
      const data = await response.json();
      setReviews(data.data.reviews || []);
      setTotal(data.data.total || 0);
    } catch (error) {
      console.error('Error fetching reviews:', error);
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
        title: 'Success',
        description: 'Review marked as helpful',
      });
    } catch (error) {
      console.error('Error marking review as helpful:', error);
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
    } catch (error) {
      console.error('Error deleting review:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete review',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading reviews...</div>;
  }

  if (reviews.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">No reviews yet. Be the first to review this product!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <Card key={review.id}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold">{review.username}</span>
                  {review.isVerifiedPurchase && (
                    <Badge variant="outline" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Verified Purchase
                    </Badge>
                  )}
                </div>
                <StarRating rating={review.rating} size={16} showValue />
                <h4 className="font-medium mt-2">{review.title}</h4>
              </div>
              <span className="text-sm text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString()}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{review.body}</p>

            {/* Media */}
            {review.images && review.images.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {review.images.map((image, index) => (
                  <div key={index} className="relative">
                    {image.match(/\.(mp4|webm|ogg)$/i) ? (
                      <video
                        src={image}
                        controls
                        className="w-full h-20 object-cover rounded"
                      />
                    ) : (
                      <img
                        src={image}
                        alt={`Review media ${index + 1}`}
                        className="w-full h-20 object-cover rounded cursor-pointer"
                        onClick={() => window.open(image, '_blank')}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleMarkHelpful(review.id)}
                className="text-muted-foreground hover:text-primary"
              >
                <ThumbsUp className="h-4 w-4 mr-1" />
                Helpful ({review.helpfulCount})
              </Button>

              {user && user.id === review.userId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteReview(review.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Pagination */}
      {total > 10 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="flex items-center px-4">
            Page {page} of {Math.ceil(total / 10)}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 10)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
