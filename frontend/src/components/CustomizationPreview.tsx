import React, { useState } from 'react';
import { getAssetUrl } from '@/lib/queryClient';
import BrandedImagePlaceholder from './BrandedImagePlaceholder';
import BraceletStructureRenderer, { SelectedCharmDetail } from './studio/BraceletStructureRenderer';
import { IBraceletStructure } from '@/types/structure';

export interface PreviewLayer {
  layerId: string;
  imageUrl?: string | null;
  zIndex: number;
  linkedFieldKey?: string;
}

export interface CustomizationPreviewProps {
  baseImage?: string | null;
  productName?: string;
  category?: string;
  layers?: PreviewLayer[];
  selections?: Record<string, string | string[]>;
  braceletStructure?: IBraceletStructure | null;
  charmDetailsMap?: Map<string, SelectedCharmDetail>;
  className?: string;
}

export const CustomizationPreview: React.FC<CustomizationPreviewProps> = ({
  baseImage,
  productName = "Customized Piece",
  category,
  layers = [],
  selections = {},
  braceletStructure = null,
  charmDetailsMap = new Map(),
  className = '',
}) => {
  const [baseHasError, setBaseHasError] = useState(false);
  const [layerErrors, setLayerErrors] = useState<Record<string, boolean>>({});

  // If a product-specific visual bracelet structure is configured, use the vector/SVG renderer
  if (braceletStructure && Array.isArray(braceletStructure.nodes) && braceletStructure.nodes.length > 0) {
    return (
      <div className={`relative w-full h-full overflow-hidden flex items-center justify-center ${className}`}>
        <BraceletStructureRenderer
          structure={braceletStructure}
          selections={selections}
          charmDetailsMap={charmDetailsMap}
          className="w-full h-full max-h-[520px]"
        />
      </div>
    );
  }

  const cleanBase = (baseImage || "").trim();

  const getLayerImageUrl = (layer: PreviewLayer): string | null => {
    const rawUrl = layer.imageUrl?.trim();
    if (!rawUrl) return null;
    return getAssetUrl(rawUrl);
  };

  return (
    <div className={`relative w-full h-full overflow-hidden flex items-center justify-center ${className}`}>
      {/* Base product layer */}
      {!cleanBase || baseHasError ? (
        <BrandedImagePlaceholder
          name={productName}
          category={category}
          size="lg"
          className="absolute inset-0 w-full h-full"
        />
      ) : (
        <img
          src={getAssetUrl(cleanBase)}
          alt={productName}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ zIndex: 0 }}
          onError={() => setBaseHasError(true)}
        />
      )}

      {/* Dynamic layers - safely skip missing or broken layers */}
      {(layers || []).map((layer) => {
        const layerSrc = getLayerImageUrl(layer);
        if (!layerSrc || layerErrors[layer.layerId]) return null;

        return (
          <img
            key={layer.layerId}
            src={layerSrc}
            alt={layer.layerId}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-300"
            style={{ zIndex: layer.zIndex || 1 }}
            onError={() => {
              setLayerErrors((prev) => ({ ...prev, [layer.layerId]: true }));
            }}
          />
        );
      })}
    </div>
  );
};

export default CustomizationPreview;
