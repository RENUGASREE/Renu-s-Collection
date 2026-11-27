import React from "react";

export interface BrandedImagePlaceholderProps {
  name: string;
  category?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
  aspectRatio?: string;
}

export const BrandedImagePlaceholder: React.FC<BrandedImagePlaceholderProps> = ({
  name,
  category,
  size = "md",
  className = "",
  aspectRatio = "aspect-square",
}) => {
  const cleanName = (name || "").trim() || "Renu's Collection";

  // Derive initial monogram (up to 2 letters) for compact sizes
  const words = cleanName.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : cleanName.slice(0, 2).toUpperCase();

  // Small size (e.g. cart thumbnail, small avatar)
  if (size === "sm") {
    return (
      <div
        className={`relative w-full h-full ${aspectRatio} flex flex-col items-center justify-center p-1 text-center bg-[#FAF9F6] dark:bg-[#1A1615] border border-[#B76E79]/30 rounded-md select-none overflow-hidden ${className}`}
        title={cleanName}
        data-testid="branded-placeholder-sm"
      >
        <span className="text-[7px] uppercase tracking-[0.2em] text-[#B76E79] font-medium leading-none mb-0.5">
          RC
        </span>
        <span className="font-playfair font-serif font-bold text-[10px] leading-tight text-[#0D0D0D] dark:text-[#F3EFEA] truncate max-w-full px-1">
          {cleanName}
        </span>
      </div>
    );
  }

  const isLgOrXl = size === "lg" || size === "xl";
  const isMd = size === "md" || size === "full";

  return (
    <div
      className={`relative w-full h-full ${aspectRatio} flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-gradient-to-br from-[#FAF9F6] via-[#F8F5F0] to-[#F3EFE8] dark:from-[#181413] dark:via-[#1E1918] dark:to-[#241F1D] border border-[#B76E79]/35 dark:border-[#B76E79]/40 rounded-lg select-none overflow-hidden ${className}`}
      data-testid="branded-placeholder"
    >
      {/* Decorative delicate inner rose-gold border */}
      <div className="absolute inset-2 sm:inset-3 border border-[#B76E79]/20 dark:border-[#B76E79]/25 rounded pointer-events-none" />

      {/* Subtle corner flourish accents */}
      <div className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 w-2 h-2 border-t border-l border-[#B76E79]/50 pointer-events-none" />
      <div className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 w-2 h-2 border-t border-r border-[#B76E79]/50 pointer-events-none" />
      <div className="absolute bottom-2.5 left-2.5 sm:bottom-3.5 sm:left-3.5 w-2 h-2 border-b border-l border-[#B76E79]/50 pointer-events-none" />
      <div className="absolute bottom-2.5 right-2.5 sm:bottom-3.5 sm:right-3.5 w-2 h-2 border-b border-r border-[#B76E79]/50 pointer-events-none" />

      {/* Centerpiece: Actual Product / Material Name & Brand detail */}
      <div className="relative z-10 flex flex-col items-center justify-center max-w-[88%] sm:max-w-[85%]">
        {/* Subtle Brand Header Detail */}
        <span className="text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-[0.25em] text-[#B76E79] font-medium mb-1.5 sm:mb-2 select-none">
          RENU&apos;S COLLECTIONS
        </span>

        {/* Optional Category subtext if present */}
        {category && (
          <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.15em] text-[#0D0D0D]/50 dark:text-[#F3EFEA]/50 font-normal mb-1 truncate max-w-full">
            {category.replace(/[_-]/g, " ")}
          </span>
        )}

        {/* Rose-gold hairline accent */}
        <div className="w-8 sm:w-12 h-[1px] bg-gradient-to-r from-transparent via-[#B76E79]/45 to-transparent mb-2 sm:mb-2.5" />

        {/* Centered Matte Black Product / Material Name */}
        <h4
          className={`font-playfair font-serif font-bold text-[#0D0D0D] dark:text-[#F3EFEA] tracking-normal leading-snug line-clamp-3 px-1 ${
            isLgOrXl
              ? "text-lg sm:text-2xl md:text-3xl max-w-md"
              : isMd
              ? "text-sm sm:text-base md:text-lg max-w-xs"
              : "text-xs sm:text-sm max-w-[200px]"
          }`}
        >
          {cleanName}
        </h4>

        {/* Bottom subtle divider line */}
        <div className="w-6 sm:w-10 h-[1px] bg-gradient-to-r from-transparent via-[#B76E79]/35 to-transparent mt-2 sm:mt-2.5" />
      </div>
    </div>
  );
};

export default BrandedImagePlaceholder;
