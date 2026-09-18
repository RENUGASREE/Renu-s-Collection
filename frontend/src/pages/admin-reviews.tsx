import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { SEO } from "@/components/SEO";
import { Check, X, Star, Calendar, User, Package } from "lucide-react";

interface Review {
  id: string;
  userId: any;
  username: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  createdAt: string;
  images: string[];
  helpfulCount: number;
}

export default function AdminReviews() {
  const { token, user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setReviews(data.data);
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
      }
    } catch (err) {
      console.error('Error approving review:', err);
    }
  };

  const handleReject = async (reviewId: string) => {
    try {
      const response = await apiRequest('POST', `/api/v1/reviews/${reviewId}/reject`);
      const data = await response.json();
      if (data.success) {
        setReviews(reviews.map(r => r.id === reviewId ? { ...r, isApproved: false } : r));
      }
    } catch (err) {
      console.error('Error rejecting review:', err);
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
                <Card key={review.id}>
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
                            Product ID: {review.productId}
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
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(review.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(review.id)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Reject
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
                <Card key={review.id} className="opacity-75">
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
                    <p className="text-sm">{review.body}</p>
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
      <Footer />
    </div>
  );
}
