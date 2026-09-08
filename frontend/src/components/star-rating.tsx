import React from 'react';
import { Star, StarHalf } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: number;
  readonly?: boolean;
  onRatingChange?: (rating: number) => void;
  showValue?: boolean;
}

export function StarRating({
  rating,
  maxRating = 5,
  size = 20,
  readonly = true,
  onRatingChange,
  showValue = false,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = React.useState(0);

  const handleMouseEnter = (starIndex: number) => {
    if (!readonly) {
      setHoverRating(starIndex);
    }
  };

  const handleMouseLeave = () => {
    if (!readonly) {
      setHoverRating(0);
    }
  };

  const handleClick = (starIndex: number) => {
    if (!readonly && onRatingChange) {
      onRatingChange(starIndex);
    }
  };

  const renderStars = () => {
    const stars = [];
    const displayRating = hoverRating || rating;

    for (let i = 1; i <= maxRating; i++) {
      const isFilled = i <= displayRating;
      const isHalf = !isFilled && i - 0.5 <= displayRating && displayRating > i - 1;

      if (isHalf) {
        stars.push(
          <StarHalf
            key={i}
            size={size}
            className="text-yellow-400 fill-yellow-400"
            onMouseEnter={() => handleMouseEnter(i)}
            onMouseLeave={handleMouseLeave}
            onClick={() => handleClick(i)}
            style={{ cursor: readonly ? 'default' : 'pointer' }}
          />
        );
      } else {
        stars.push(
          <Star
            key={i}
            size={size}
            className={isFilled ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
            onMouseEnter={() => handleMouseEnter(i)}
            onMouseLeave={handleMouseLeave}
            onClick={() => handleClick(i)}
            style={{ cursor: readonly ? 'default' : 'pointer' }}
          />
        );
      }
    }

    return stars;
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex">{renderStars()}</div>
      {showValue && (
        <span className="text-sm font-medium text-muted-foreground">
          {rating.toFixed(1)} / {maxRating}
        </span>
      )}
    </div>
  );
}
