import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { getAssetUrl } from '@/lib/queryClient';

interface CustomizationOption {
  value: string;
  label: string;
  priceModifier?: number;
  imageUrl?: string;
  metadata?: Record<string, string>;
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
}) => {
  const renderOptionCard = (
    field: CustomizationField,
    option: CustomizationOption,
    isSelected: boolean,
    onSelect: () => void
  ) => {
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
          className={`group relative rounded-xl border transition-all cursor-pointer flex flex-col overflow-hidden select-none min-h-[44px] ${
            isSelected
              ? 'border-[#B66F72] ring-2 ring-[#B66F72]/30 bg-[#B66F72]/5 dark:bg-primary/10 shadow-xs'
              : 'border-[#E6D8D0] dark:border-border hover:border-[#B66F72]/50 hover:bg-[#FBF7F3]/60 dark:hover:bg-muted/30 bg-white dark:bg-card'
          }`}
        >
          {/* Option Image Container */}
          <div className="relative aspect-square w-full overflow-hidden bg-[#FBF7F3] dark:bg-muted/40 border-b border-[#E6D8D0]/60 dark:border-border/60">
            <img
              src={getAssetUrl(option.imageUrl)}
              alt={option.label}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo.png';
              }}
            />
            {isSelected && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#B66F72] text-white flex items-center justify-center shadow-sm">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            )}
          </div>

          {/* Option Details */}
          <div className="p-2.5 sm:p-3 text-center flex flex-col justify-between flex-1">
            <p className="text-xs sm:text-sm font-medium text-[#342824] dark:text-foreground leading-snug break-words">
              {option.label}
            </p>
            {option.priceModifier !== undefined && option.priceModifier !== 0 && (
              <span className="text-[11px] sm:text-xs font-semibold text-[#B66F72] dark:text-primary mt-1">
                {option.priceModifier > 0 ? '+' : ''}₹{option.priceModifier.toLocaleString('en-IN')}
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
        className={`cursor-pointer transition-all border rounded-xl overflow-hidden min-h-[44px] flex flex-col justify-center select-none ${
          isSelected
            ? 'border-[#B66F72] ring-2 ring-[#B66F72]/30 bg-[#B66F72]/5 dark:bg-primary/10 shadow-xs'
            : 'border-[#E6D8D0] dark:border-border hover:border-[#B66F72]/50 hover:bg-[#FBF7F3]/60 dark:hover:bg-muted/30 bg-white dark:bg-card'
        }`}
        onClick={() => !disabled && onSelect()}
      >
        <CardContent className="p-3 text-center flex flex-col items-center justify-center relative">
          {isSelected && (
            <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#B66F72] text-white flex items-center justify-center shadow-xs">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </div>
          )}
          <p className="font-medium text-xs sm:text-sm text-[#342824] dark:text-foreground break-words max-w-full">
            {option.label}
          </p>
          {option.priceModifier !== undefined && option.priceModifier !== 0 && (
            <Badge
              variant="secondary"
              className="mt-1 text-[10px] sm:text-xs font-semibold text-[#B66F72] dark:text-primary bg-[#F1E6DF]/70 dark:bg-muted border border-[#E6D8D0]/60 dark:border-border"
            >
              {option.priceModifier > 0 ? '+' : ''}₹{option.priceModifier.toLocaleString('en-IN')}
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
          className={`grid gap-3 ${
            hasAnyImages
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-3'
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
    const values = (selections[field.key] as string[]) || [];
    const displayName = normalizeFieldLabel(field.key, field.label);
    const hasAnyImages = field.options?.some((o) => !!o.imageUrl);

    return (
      <div key={field.key} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Label className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground">
              {displayName}
            </Label>
            {field.required && values.length === 0 && (
              <span className="text-[#B66F72] font-semibold text-xs">* (Required)</span>
            )}
          </div>
          {values.length > 0 && (
            <span className="text-xs text-[#B99A72] font-medium">
              {values.length} selected
            </span>
          )}
        </div>

        <div
          className={`grid gap-3 ${
            hasAnyImages
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-3'
          }`}
        >
          {field.options?.map((option) => {
            const isSelected = values.includes(option.value) || values.includes(option.label);
            return renderOptionCard(field, option, isSelected, () => {
              const newValues = isSelected
                ? values.filter((v) => v !== option.value && v !== option.label)
                : [...values, option.value];
              onChange(field.key, newValues);
            });
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

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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

