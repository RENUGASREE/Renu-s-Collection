import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check, Plus, Minus, AlertTriangle } from 'lucide-react';
import { getAssetUrl } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import ProductImage from '@/components/ProductImage';

interface CustomizationOption {
  value: string;
  label: string;
  priceModifier?: number;
  imageUrl?: string;
  metadata?: Record<string, string>;
  materialId?: string | null;
  variantSku?: string | null;
  inStock?: boolean;
  stock?: number;
}

interface CustomizationField {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'color' | 'text' | 'number';
  options?: CustomizationOption[];
  required?: boolean;
  sortOrder?: number;
}

interface CustomizationControlsProps {
  fields: CustomizationField[];
  selections: Record<string, string | string[]>;
  onChange: (key: string, value: string | string[]) => void;
  disabled?: boolean;
  maxCharms?: number;
  charmCountMode?: 'total_units' | 'distinct_types';
  allUnitSelections?: Array<Record<string, string | string[]>>;
  currentUnitIndex?: number;
}

const resolveColor = (val: string) => {
  if (!val) return '#cccccc';
  const clean = val.trim();
  if (clean.startsWith('#')) return clean;
  if (/^[0-9A-Fa-f]{3,8}$/.test(clean)) return `#${clean}`;
  return clean;
};

/**
 * Normalizes technical field keys for display (e.g. bead_colour -> Bead Colour, Bracelet_Size -> Bracelet Size).
 * Prefers existing customer-facing labels when available.
 */
function normalizeFieldLabel(key: string, label?: string): string {
  if (label && label.trim() && label !== key && !label.includes('_')) {
    return label;
  }
  const raw = label && label.trim() ? label : key;
  return raw
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const CustomizationControls: React.FC<CustomizationControlsProps> = ({
  fields,
  selections,
  onChange,
  disabled = false,
  maxCharms,
  charmCountMode,
  allUnitSelections,
  currentUnitIndex,
}) => {
  const renderOptionCard = (
    field: CustomizationField,
    option: CustomizationOption,
    isSelected: boolean,
    onSelect: () => void,
    count = isSelected ? 1 : 0,
    onIncrement?: () => void,
    onDecrement?: () => void,
    disableIncrement = false,
    disableSelect = false,
    remainingStock?: number
  ) => {
    const isMultiQuantity = isSelected && onIncrement && onDecrement;

    if (option.imageUrl) {
      return (
        <div
          key={option.value}
          role="button"
          tabIndex={0}
          aria-pressed={isSelected}
          onClick={() => !disabled && onSelect()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              onSelect();
            }
          }}
          className={`group relative rounded-lg border transition-all cursor-pointer flex flex-col overflow-hidden select-none min-h-[40px] ${
            disableSelect
              ? 'opacity-40 cursor-not-allowed border-[#E6D8D0]/60 bg-stone-50'
              : isSelected
              ? 'border-[#B66F72] ring-2 ring-[#B66F72]/30 bg-[#B66F72]/5 dark:bg-primary/10 shadow-xs'
              : 'border-[#E6D8D0] dark:border-border hover:border-[#B66F72]/50 hover:bg-[#FBF7F3]/60 dark:hover:bg-muted/30 bg-white dark:bg-card'
          }`}
        >
          {/* Option Image Container */}
          <div className="relative aspect-square w-full overflow-hidden bg-[#FBF7F3] dark:bg-muted/40 border-b border-[#E6D8D0]/60 dark:border-border/60">
            <ProductImage
              src={option.imageUrl}
              alt={option.label}
              name={option.label}
              size="sm"
              className="w-full h-full"
              imgClassName="group-hover:scale-105"
            />
            {isMultiQuantity ? (
              <div
                className="absolute top-1 right-1 flex items-center bg-[#B66F72] text-white rounded-md shadow-xs px-1 py-0.5 gap-0.5 text-[10px] z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="p-0.5 hover:bg-black/20 rounded-sm transition-colors"
                  aria-label={`Decrease ${option.label} count`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecrement();
                  }}
                  title="Remove one"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <span className="font-bold text-[10px] min-w-[12px] text-center">{count}</span>
                <button
                  type="button"
                  disabled={disableIncrement}
                  className={`p-0.5 rounded-sm transition-colors ${
                    disableIncrement
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-black/20'
                  }`}
                  aria-label={`Increase ${option.label} count`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!disableIncrement) onIncrement();
                  }}
                  title={disableIncrement ? "Limit or stock reached" : "Add another"}
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : isSelected ? (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#B66F72] text-white flex items-center justify-center shadow-xs">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
            ) : null}
          </div>

          {/* Option Details */}
          <div className="p-1.5 sm:p-2 text-center flex flex-col justify-between flex-1">
            <p className="text-[11px] sm:text-xs font-medium text-[#342824] dark:text-foreground leading-tight line-clamp-2 break-words">
              {option.label}
            </p>
            {remainingStock !== undefined && remainingStock <= 2 && remainingStock > 0 && (
              <span className="text-[9px] text-amber-600 font-medium">Low ({remainingStock})</span>
            )}
            {option.priceModifier !== undefined && option.priceModifier !== 0 && (
              <span className="text-[10px] sm:text-[11px] font-semibold text-[#B66F72] dark:text-primary mt-0.5">
                {count > 1 ? (
                  <>
                    +₹{((option.priceModifier || 0) * count).toLocaleString('en-IN')}{' '}
                    <span className="text-[9px] text-muted-foreground font-normal">
                      (₹{option.priceModifier} × {count})
                    </span>
                  </>
                ) : (
                  `${option.priceModifier > 0 ? '+' : ''}₹${option.priceModifier.toLocaleString('en-IN')}`
                )}
              </span>
            )}
          </div>
        </div>
      );
    }

    // Text-only card
    return (
      <Card
        key={option.value}
        className={`cursor-pointer transition-all border rounded-lg overflow-hidden min-h-[40px] flex flex-col justify-center select-none ${
          disableSelect
            ? 'opacity-40 cursor-not-allowed border-[#E6D8D0]/60 bg-stone-50'
            : isSelected
            ? 'border-[#B66F72] ring-2 ring-[#B66F72]/30 bg-[#B66F72]/5 dark:bg-primary/10 shadow-xs'
            : 'border-[#E6D8D0] dark:border-border hover:border-[#B66F72]/50 hover:bg-[#FBF7F3]/60 dark:hover:bg-muted/30 bg-white dark:bg-card'
        }`}
        onClick={() => !disabled && onSelect()}
      >
        <CardContent className="p-2 sm:p-2.5 text-center flex flex-col items-center justify-center relative">
          {isMultiQuantity ? (
            <div
              className="absolute top-1 right-1 flex items-center bg-[#B66F72] text-white rounded-md shadow-xs px-1 py-0.5 gap-0.5 text-[10px] z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="p-0.5 hover:bg-black/20 rounded-sm transition-colors"
                aria-label={`Decrease ${option.label} count`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDecrement();
                }}
              >
                <Minus className="w-2.5 h-2.5" />
              </button>
              <span className="font-bold text-[10px] min-w-[12px] text-center">{count}</span>
              <button
                type="button"
                disabled={disableIncrement}
                className={`p-0.5 rounded-sm transition-colors ${
                  disableIncrement
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-black/20'
                }`}
                aria-label={`Increase ${option.label} count`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disableIncrement) onIncrement();
                }}
              >
                <Plus className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : isSelected ? (
            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#B66F72] text-white flex items-center justify-center shadow-xs">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </div>
          ) : null}
          <p className="font-medium text-[11px] sm:text-xs text-[#342824] dark:text-foreground break-words max-w-full leading-tight line-clamp-2">
            {option.label}
          </p>
          {remainingStock !== undefined && remainingStock <= 2 && remainingStock > 0 && (
            <span className="text-[9px] text-amber-600 font-medium">Low ({remainingStock})</span>
          )}
          {option.priceModifier !== undefined && option.priceModifier !== 0 && (
            <Badge
              variant="secondary"
              className="mt-0.5 text-[9px] sm:text-[10px] font-semibold text-[#B66F72] dark:text-primary bg-[#F1E6DF]/70 dark:bg-muted border border-[#E6D8D0]/60 dark:border-border px-1.5 py-0"
            >
              {count > 1
                ? `+₹${((option.priceModifier || 0) * count).toLocaleString('en-IN')} (×${count})`
                : `${option.priceModifier > 0 ? '+' : ''}₹${option.priceModifier.toLocaleString('en-IN')}`}
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderSelectField = (field: CustomizationField) => {
    const value = selections[field.key] as string | undefined;
    const displayName = normalizeFieldLabel(field.key, field.label);
    const hasAnyImages = field.options?.some((o) => !!o.imageUrl);

    return (
      <div key={field.key} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Label className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground">
              {displayName}
            </Label>
            {field.required && (
              <span className="text-[#B66F72] font-semibold text-xs">* (Required)</span>
            )}
          </div>
          {value && (
            <span className="text-xs text-[#B99A72] font-medium hidden sm:inline">
              Selected: {field.options?.find((o) => o.value === value || o.label === value)?.label || value}
            </span>
          )}
        </div>

        <div
          className={`grid gap-2 sm:gap-2.5 ${
            hasAnyImages
              ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
          }`}
        >
          {field.options?.map((option) => {
            const isSelected = value === option.value || value === option.label;
            return renderOptionCard(field, option, isSelected, () => onChange(field.key, option.value));
          })}
        </div>
      </div>
    );
  };

  const renderMultiselectField = (field: CustomizationField) => {
    const rawVal = selections[field.key];
    const values = Array.isArray(rawVal) ? (rawVal as string[]) : rawVal ? [String(rawVal)] : [];
    const displayName = normalizeFieldLabel(field.key, field.label);
    const hasAnyImages = field.options?.some((o) => !!o.imageUrl);

    // Instant validation: maximum charms allowed
    const effectiveMaxCharms = maxCharms ?? (field as any).max ?? 3;
    const countMode = charmCountMode ?? "total_units";
    const selectedCount = countMode === "distinct_types"
      ? new Set(values).size
      : values.length;
    const isAtMaxLimit = selectedCount >= effectiveMaxCharms;

    return (
      <div key={field.key} className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground">
              {displayName}
            </Label>
            {field.required && values.length === 0 && (
              <span className="text-[#B66F72] font-semibold text-xs">* (Required)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#B66F72] bg-[#FAF4F1] dark:bg-muted/40 px-2.5 py-0.5 rounded-full border border-[#B66F72]/30">
              Selected charms: {selectedCount} / {effectiveMaxCharms}
            </span>
          </div>
        </div>

        {/* Immediate alert when maximum charm limit is reached */}
        {isAtMaxLimit && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Maximum of {effectiveMaxCharms} charms reached. Remove a charm to select another.</span>
          </div>
        )}

        <div
          className={`grid gap-2 sm:gap-2.5 ${
            hasAnyImages
              ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
          }`}
        >
          {field.options?.map((option) => {
            const count = values.filter((v) => v === option.value || v === option.label).length;
            const isSelected = count > 0;

            // Authoritative stock availability across all bracelet units
            const rawStock = typeof option.stock === "number" ? option.stock : (option.inStock !== false ? 999 : 0);
            let usedInOtherUnits = 0;
            if (allUnitSelections && currentUnitIndex !== undefined) {
              for (let i = 0; i < allUnitSelections.length; i++) {
                if (i === currentUnitIndex) continue;
                const otherVals = allUnitSelections[i]?.[field.key];
                if (Array.isArray(otherVals)) {
                  usedInOtherUnits += otherVals.filter(v => v === option.value || v === option.label).length;
                }
              }
            }
            const remainingStock = Math.max(0, rawStock - usedInOtherUnits);
            const isStockExhausted = count >= remainingStock;
            const disableIncrement = isAtMaxLimit || isStockExhausted;
            const disableSelect = !isSelected && (isAtMaxLimit || remainingStock <= 0);

            const handleToggle = () => {
              if (isSelected) return;
              if (isAtMaxLimit) {
                toast({
                  title: "Charm Limit Reached",
                  description: `Maximum of ${effectiveMaxCharms} charms reached. Remove a charm to select another.`,
                  variant: "destructive",
                });
                return;
              }
              if (remainingStock <= 0) {
                toast({
                  title: "Stock Unavailable",
                  description: `Only ${rawStock} ${option.label} is currently available in stock.`,
                  variant: "destructive",
                });
                return;
              }
              onChange(field.key, [...values, option.value]);
            };

            const handleIncrement = () => {
              if (isAtMaxLimit) {
                toast({
                  title: "Charm Limit Reached",
                  description: `Maximum of ${effectiveMaxCharms} charms reached. Remove a charm to select another.`,
                  variant: "destructive",
                });
                return;
              }
              if (count >= remainingStock) {
                toast({
                  title: "Stock Limit Reached",
                  description: `Only ${rawStock} ${option.label} is currently available in stock.`,
                  variant: "destructive",
                });
                return;
              }
              onChange(field.key, [...values, option.value]);
            };

            const handleDecrement = () => {
              const idx = values.findIndex((v) => v === option.value || v === option.label);
              if (idx >= 0) {
                const next = [...values];
                next.splice(idx, 1);
                onChange(field.key, next);
              }
            };

            return renderOptionCard(
              field,
              option,
              isSelected,
              handleToggle,
              count,
              handleIncrement,
              handleDecrement,
              disableIncrement,
              disableSelect,
              remainingStock
            );
          })}
        </div>
      </div>
    );
  };

  const renderColorField = (field: CustomizationField) => {
    const value = selections[field.key] as string | undefined;
    const displayName = normalizeFieldLabel(field.key, field.label);
    const selectedOption = field.options?.find(
      (o) => o.value === value || o.label === value
    );
    const hasAnyImages = field.options?.some((o) => !!o.imageUrl);

    // If options in this color field have images attached, render them as visual option cards!
    if (hasAnyImages) {
      return (
        <div key={field.key} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Label className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground">
                {displayName}
              </Label>
              {field.required && (
                <span className="text-[#B66F72] font-semibold text-xs">* (Required)</span>
              )}
            </div>
            {selectedOption && (
              <span className="text-xs text-[#B99A72] font-medium">
                Selected: {selectedOption.label}
                {selectedOption.priceModifier ? ` (+₹${selectedOption.priceModifier})` : ''}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-2.5">
            {field.options?.map((option) => {
              const isSelected = value === option.value || value === option.label;
              return renderOptionCard(field, option, isSelected, () => onChange(field.key, option.value));
            })}
          </div>
        </div>
      );
    }

    // Otherwise render polished color swatches with actual background color
    return (
      <div key={field.key} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Label className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground">
              {displayName}
            </Label>
            {field.required && (
              <span className="text-[#B66F72] font-semibold text-xs">* (Required)</span>
            )}
          </div>
          {selectedOption && (
            <span className="text-xs text-[#B99A72] font-medium">
              Selected: {selectedOption.label}
              {selectedOption.priceModifier ? ` (+₹${selectedOption.priceModifier})` : ''}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-4 items-center pt-1">
          {field.options?.map((option) => {
            const isSelected = value === option.value || value === option.label;
            const bg = resolveColor(option.value);

            return (
              <div key={option.value} className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  disabled={disabled}
                  className={`w-11 h-11 rounded-full border-2 transition-all shadow-sm relative flex items-center justify-center focus:outline-none ${
                    isSelected
                      ? 'ring-2 ring-offset-2 ring-[#B66F72] scale-110 border-[#B66F72]'
                      : 'border-[#E6D8D0] dark:border-border hover:scale-105 hover:border-[#B66F72]/50'
                  }`}
                  style={{ backgroundColor: bg }}
                  onClick={() => onChange(field.key, option.value)}
                  title={`${option.label}${option.priceModifier ? ` (+₹${option.priceModifier})` : ''}`}
                >
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-[#B66F72] text-white flex items-center justify-center shadow-xs">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </button>
                <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium text-center max-w-[84px] leading-tight break-words">
                  {option.label}
                </span>
                {option.priceModifier !== undefined && option.priceModifier > 0 && (
                  <span className="text-[10px] text-[#B66F72] dark:text-primary font-semibold">
                    +₹{option.priceModifier.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTextField = (field: CustomizationField) => {
    const value = (selections[field.key] as string) || '';
    const displayName = normalizeFieldLabel(field.key, field.label);
    
    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={field.key} className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground">
            {displayName}
          </Label>
          {field.required && (
            <span className="text-[#B66F72] font-semibold text-xs">* (Required)</span>
          )}
        </div>
        <Input
          id={field.key}
          type="text"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={disabled}
          placeholder={`Enter ${displayName.toLowerCase()}`}
          maxLength={100}
          className="border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]/30 rounded-xl"
        />
        <p className="text-[11px] text-[#756861] dark:text-muted-foreground">Maximum 100 characters</p>
      </div>
    );
  };

  const renderNumberField = (field: CustomizationField) => {
    const value = (selections[field.key] as string | number) ?? '';
    const displayName = normalizeFieldLabel(field.key, field.label);
    
    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={field.key} className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground">
            {displayName}
          </Label>
          {field.required && (
            <span className="text-[#B66F72] font-semibold text-xs">* (Required)</span>
          )}
        </div>
        <Input
          id={field.key}
          type="number"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={disabled}
          placeholder={`Enter ${displayName.toLowerCase()}`}
          min="0"
          step="any"
          className="border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]/30 rounded-xl"
        />
      </div>
    );
  };

  const renderField = (field: CustomizationField) => {
    switch (field.type) {
      case 'select':
        return renderSelectField(field);
      case 'multiselect':
        return renderMultiselectField(field);
      case 'color':
        return renderColorField(field);
      case 'text':
        return renderTextField(field);
      case 'number':
        return renderNumberField(field);
      default:
        return null;
    }
  };

  const sortedFields = [...fields].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  return (
    <div className="space-y-6">
      {sortedFields.map(renderField)}
    </div>
  );
};

