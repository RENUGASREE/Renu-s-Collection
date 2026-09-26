import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

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

export const CustomizationControls: React.FC<CustomizationControlsProps> = ({
  fields,
  selections,
  onChange,
  disabled = false,
}) => {
  const renderSelectField = (field: CustomizationField) => {
    const value = selections[field.key] as string | undefined;
    
    return (
      <div key={field.key} className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="font-medium text-sm md:text-base">{field.label}</Label>
          {field.required && <span className="text-red-500">*</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {field.options?.map((option) => {
            const isSelected = value === option.value || value === option.label;
            return (
              <Card
                key={option.value}
                className={`cursor-pointer transition-all border ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                    : 'border-border/70 hover:border-primary/50'
                }`}
                onClick={() => !disabled && onChange(field.key, option.value)}
              >
                <CardContent className="p-3">
                  {option.imageUrl ? (
                    <div className="space-y-2">
                      <img
                        src={option.imageUrl}
                        alt={option.label}
                        className="w-full h-20 object-cover rounded"
                      />
                      <p className="text-sm font-medium text-center">{option.label}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="font-medium text-sm">{option.label}</p>
                      {option.priceModifier !== undefined && option.priceModifier !== 0 && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {option.priceModifier > 0 ? '+' : ''}₹{option.priceModifier}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMultiselectField = (field: CustomizationField) => {
    const values = (selections[field.key] as string[]) || [];
    
    return (
      <div key={field.key} className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="font-medium text-sm md:text-base">{field.label}</Label>
          {field.required && values.length === 0 && <span className="text-red-500">*</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {field.options?.map((option) => {
            const isSelected = values.includes(option.value) || values.includes(option.label);
            return (
              <Card
                key={option.value}
                className={`cursor-pointer transition-all border ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                    : 'border-border/70 hover:border-primary/50'
                }`}
                onClick={() => {
                  if (disabled) return;
                  const newValues = isSelected
                    ? values.filter((v) => v !== option.value && v !== option.label)
                    : [...values, option.value];
                  onChange(field.key, newValues);
                }}
              >
                <CardContent className="p-3">
                  {option.imageUrl ? (
                    <div className="space-y-2">
                      <img
                        src={option.imageUrl}
                        alt={option.label}
                        className="w-full h-20 object-cover rounded"
                      />
                      <p className="text-sm font-medium text-center">{option.label}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="font-medium text-sm">{option.label}</p>
                      {option.priceModifier !== undefined && option.priceModifier !== 0 && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {option.priceModifier > 0 ? '+' : ''}₹{option.priceModifier}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const renderColorField = (field: CustomizationField) => {
    const value = selections[field.key] as string | undefined;
    const selectedOption = field.options?.find(
      (o) => o.value === value || o.label === value
    );

    return (
      <div key={field.key} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="font-medium text-sm md:text-base">{field.label}</Label>
            {field.required && <span className="text-red-500">*</span>}
          </div>
          {selectedOption && (
            <span className="text-xs md:text-sm font-medium text-primary">
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
                  className={`w-11 h-11 rounded-full border-2 border-slate-300 dark:border-slate-600 transition-all shadow-sm relative flex items-center justify-center focus:outline-none ${
                    isSelected
                      ? 'ring-2 ring-offset-2 ring-primary scale-110 border-primary'
                      : 'hover:scale-105 hover:border-slate-400'
                  }`}
                  style={{ backgroundColor: bg }}
                  onClick={() => onChange(field.key, option.value)}
                  title={`${option.label}${option.priceModifier ? ` (+₹${option.priceModifier})` : ''}`}
                >
                  {isSelected && (
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-white shadow-sm ring-1 ring-black/30"
                      aria-hidden="true"
                    />
                  )}
                </button>
                <span className="text-xs text-muted-foreground font-medium text-center max-w-[72px] truncate leading-tight">
                  {option.label}
                </span>
                {option.priceModifier !== undefined && option.priceModifier > 0 && (
                  <span className="text-[10px] text-primary font-semibold">
                    +₹{option.priceModifier}
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
    
    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={field.key} className="font-medium text-sm md:text-base">{field.label}</Label>
          {field.required && <span className="text-red-500">*</span>}
        </div>
        <Input
          id={field.key}
          type="text"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={disabled}
          placeholder={`Enter ${field.label.toLowerCase()}`}
          maxLength={100}
        />
        <p className="text-xs text-muted-foreground">Maximum 100 characters</p>
      </div>
    );
  };

  const renderNumberField = (field: CustomizationField) => {
    const value = (selections[field.key] as string | number) ?? '';
    
    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={field.key} className="font-medium text-sm md:text-base">{field.label}</Label>
          {field.required && <span className="text-red-500">*</span>}
        </div>
        <Input
          id={field.key}
          type="number"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={disabled}
          placeholder={`Enter ${field.label.toLowerCase()}`}
          min="0"
          step="any"
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
