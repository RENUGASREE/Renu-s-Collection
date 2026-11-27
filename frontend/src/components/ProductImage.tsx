import React, { useState, useEffect } from "react";
import { getAssetUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import BrandedImagePlaceholder from "./BrandedImagePlaceholder";

export interface ProductImageProps {
  src?: string | null;
  alt: string;
  name?: string;
  category?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
  imgClassName?: string;
  aspectRatio?: string;
  loading?: "lazy" | "eager";
  onClick?: (e: React.MouseEvent) => void;
  dataTestId?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  name,
  category,
  size = "md",
  className = "",
  imgClassName = "",
  aspectRatio = "aspect-square",
  loading = "lazy",
  onClick,
  dataTestId,
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const cleanSrc = (src || "").trim();
  const displayName = (name || alt || "").trim();

  // Reset error & load state when src changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [src]);

  const hasCustomWidth = className && /\b(w-\d+|w-\[|size-)/.test(className);
  const hasCustomAspect = className && /\baspect-/.test(className);

  const containerClasses = cn(
    "relative overflow-hidden",
    !hasCustomWidth && "w-full",
    !hasCustomAspect && aspectRatio,
    "bg-secondary/20",
    className
  );

  // If no source is provided or image errored, render the branded placeholder
  if (!cleanSrc || hasError) {
    return (
      <div className={containerClasses} onClick={onClick}>
        <BrandedImagePlaceholder
          name={displayName}
          category={category}
          size={size}
          aspectRatio={aspectRatio}
        />
      </div>
    );
  }

  const resolvedSrc = getAssetUrl(cleanSrc);

  return (
    <div
      className={containerClasses}
      onClick={onClick}
      data-testid={dataTestId}
    >
      <img
        src={resolvedSrc}
        alt={alt || displayName}
        loading={loading}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          if (!hasError) {
            setHasError(true);
          }
        }}
        className={cn(
          "w-full h-full object-cover transition-all duration-500 ease-out",
          isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95",
          imgClassName
        )}
      />
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-muted/50 dark:bg-muted/30 animate-pulse" />
      )}
    </div>
  );
};

export default ProductImage;
