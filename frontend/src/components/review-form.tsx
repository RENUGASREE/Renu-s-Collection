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
import { Upload, X } from 'lucide-react';

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedImages: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'reviews_preset'); // You'll need to configure this in Cloudinary

        // For now, we'll use a placeholder. In production, integrate with Cloudinary or similar
        const reader = new FileReader();
        reader.readAsDataURL(file);
        await new Promise((resolve) => {
          reader.onload = () => {
            uploadedImages.push(reader.result as string);
            resolve(null);
          };
        });
      }

      setImages([...images, ...uploadedImages]);
      toast({
        title: 'Success',
        description: 'Images uploaded successfully',
      });
    } catch (error) {
      console.error('Error uploading images:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload images',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to submit a review',
        variant: 'destructive',
      });
      return;
    }

    if (rating === 0) {
      toast({
        title: 'Error',
        description: 'Please select a rating',
        variant: 'destructive',
      });
      return;
    }

    if (!title.trim() || !body.trim()) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiRequest('POST', '/api/v1/reviews', {
        productId,
        rating,
        title,
        body,
        images: images.filter(img => img && img.length > 0),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Your review has been submitted and will be visible after approval',
        });
        setRating(0);
        setTitle('');
        setBody('');
        setImages([]);
        onSuccess?.();
      } else {
        throw new Error(data.message || 'Failed to submit review');
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to submit review',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

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
            <Label htmlFor="images" className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Photos / Videos (Optional)</Label>
            <div className="flex items-center gap-2.5">
              <Input
                id="images"
                type="file"
                accept="image/*,video/*"
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
                {uploading ? 'Uploading...' : 'Upload Media'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {images.length > 0 ? `${images.length} file(s) selected` : 'Max file size: 5MB'}
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
