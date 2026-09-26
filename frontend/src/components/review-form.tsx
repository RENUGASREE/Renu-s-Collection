import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { StarRating } from './star-rating';
import { Upload, X, CheckCircle2 } from 'lucide-react';

interface ReviewFormProps {
  productId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ReviewForm({ productId, onSuccess, onCancel }: ReviewFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Cloud storage infrastructure is pending integration.
    // Client-side image attachment is limited to small preview images (< 500KB total) until cloud storage is provisioned.
    setUploading(true);
    const uploadedImages: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!file.type.startsWith('image/')) {
          toast({
            title: 'Invalid File Type',
            description: 'Only image files (JPG, PNG, WebP) are supported for reviews.',
            variant: 'destructive',
          });
          continue;
        }

        // Limit individual image size to 250KB to respect JSON payload limits
        if (file.size > 250 * 1024) {
          toast({
            title: 'Image Too Large',
            description: `"${file.name}" exceeds the 250KB limit. Please choose a smaller image.`,
            variant: 'destructive',
          });
          continue;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        await new Promise((resolve) => {
          reader.onload = () => {
            if (reader.result) {
              uploadedImages.push(reader.result as string);
            }
            resolve(null);
          };
        });
      }

      if (uploadedImages.length > 0) {
        setImages((prev) => [...prev, ...uploadedImages].slice(0, 3));
        toast({
          title: 'Photo Added',
          description: 'Image attached to your review.',
        });
      }
    } catch (error) {
      console.error('Error reading image:', error);
      toast({
        title: 'Upload Issue',
        description: 'Failed to process the selected image.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      // Reset input value so same file can be re-selected if removed
      e.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitting) return;

    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'You must be logged in to submit a review',
        variant: 'destructive',
      });
      return;
    }

    if (rating === 0) {
      toast({
        title: 'Rating Required',
        description: 'Please select a rating of 1 to 5 stars',
        variant: 'destructive',
      });
      return;
    }

    if (!title.trim() || !body.trim()) {
      toast({
        title: 'Incomplete Review',
        description: 'Please provide both a title and review comments',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiRequest('POST', '/api/v1/reviews', {
        productId,
        rating,
        title: title.trim(),
        body: body.trim(),
        images: images.filter(img => img && img.length > 0),
      });

      if (response.status === 409) {
        setAlreadyReviewed(true);
        toast({
          title: 'Review Already Submitted',
          description: "You've already reviewed this product. Each verified customer can submit one review per piece.",
        });
        return;
      }

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: 'Review Received',
          description: 'Thank you! Your review has been submitted and will appear once verified by our team.',
        });
        setRating(0);
        setTitle('');
        setBody('');
        setImages([]);
        onSuccess?.();
      } else {
        const errorMsg = data.message || 'Failed to submit review';
        if (response.status === 409 || errorMsg.toLowerCase().includes('already reviewed')) {
          setAlreadyReviewed(true);
          toast({
            title: 'Review Already Submitted',
            description: "You've already reviewed this product. Each verified customer can submit one review per piece.",
          });
        } else {
          throw new Error(errorMsg);
        }
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to submit review';
      if (errorMsg.includes('409') || errorMsg.toLowerCase().includes('already reviewed')) {
        setAlreadyReviewed(true);
        toast({
          title: 'Review Already Submitted',
          description: "You've already reviewed this product. Each verified customer can submit one review per piece.",
        });
      } else {
        console.error('Error submitting review:', error);
        toast({
          title: 'Submission Issue',
          description: errorMsg,
          variant: 'destructive',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadyReviewed) {
    return (
      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden p-6 text-center">
        <div className="flex flex-col items-center justify-center space-y-3 py-4">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="font-serif text-lg font-medium text-foreground">Review Already Submitted</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            You've already submitted a review for this piece. Verified customer reviews ensure authentic feedback for our jewellery collectors.
          </p>
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel} className="mt-2 text-xs">
              Close
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="border border-border/50 bg-card/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="border-b border-border/30 pb-4">
        <CardTitle className="font-serif text-xl tracking-tight text-foreground">Write a Review</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">Share your feedback on craftsmanship, quality, and style.</p>
      </CardHeader>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rating */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Rating *</Label>
            <div className="flex items-center gap-3">
              <StarRating
                rating={rating}
                maxRating={5}
                readonly={false}
                onRatingChange={setRating}
                size={24}
              />
              <span className="text-xs text-muted-foreground">
                {rating === 1 && "Poor"}
                {rating === 2 && "Fair"}
                {rating === 3 && "Good"}
                {rating === 4 && "Very Good"}
                {rating === 5 && "Excellent"}
                {rating === 0 && "Select a rating"}
              </span>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Review Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Stunning craftsmanship and sparkle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="rounded-lg border-border/60 focus-visible:ring-primary/40 text-sm"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="body" className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Your Review *</Label>
            <Textarea
              id="body"
              placeholder="Tell others what you loved about this piece..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={4}
              required
              className="rounded-lg border-border/60 focus-visible:ring-primary/40 text-sm leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground/75 text-right">
              {body.length}/2000 characters
            </p>
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <Label htmlFor="images" className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Photos (Optional)</Label>
            <div className="flex items-center gap-2.5">
              <Input
                id="images"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleImageUpload}
                disabled={uploading}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('images')?.click()}
                disabled={uploading}
                className="rounded-lg border-border/60 hover:border-primary/50 text-xs"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {uploading ? 'Attaching...' : 'Attach Photos'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {images.length > 0 ? `${images.length}/3 photo(s) selected` : 'Max 3 photos, up to 250KB each'}
              </span>
            </div>

            {/* Image Preview */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2.5 mt-2">
                {images.map((image, index) => (
                  <div key={index} className="relative group overflow-hidden rounded-lg border border-border/50 shadow-sm">
                    <img
                      src={image}
                      alt={`Review preview ${index + 1}`}
                      className="w-20 h-20 object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full shadow"
                      onClick={() => removeImage(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 pt-3 border-t border-border/30">
            <Button
              type="submit"
              disabled={submitting || uploading}
              className="rounded-lg text-xs font-medium px-5 h-9"
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="rounded-lg text-xs h-9"
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
