import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { apiRequest, getAssetUrl, formatApiErrorMessage } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import AdminNav from '@/components/AdminNav';
import { SEO } from '@/components/SEO';
import ImageUploadField from '@/components/ImageUploadField';
import { Settings, Plus, Pencil, Trash2, Sparkles, Type, Hash, Palette, List, LayoutList, ImageIcon, ImageOff, X, Check } from 'lucide-react';

interface CustomizationField {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'color' | 'text' | 'number';
  options?: { value: string; label: string; priceModifier?: number; imageUrl?: string }[];
  required?: boolean;
  sortOrder?: number;
}

interface Category {
  _id: string;
  name: string;
  productType: string;
  customizationFields: CustomizationField[];
}

const FIELD_TYPE_ICONS: Record<string, React.ReactNode> = {
  select: <List className="h-3.5 w-3.5" />,
  multiselect: <LayoutList className="h-3.5 w-3.5" />,
  color: <Palette className="h-3.5 w-3.5" />,
  text: <Type className="h-3.5 w-3.5" />,
  number: <Hash className="h-3.5 w-3.5" />,
};

export default function AdminCustomization() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<CustomizationField | null>(null);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await apiRequest('GET', '/api/v1/categories');
      const data = await response.json();
      setCategories(data.data);
    } catch (error) {
      toast({
        title: 'Error',
        description: formatApiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveField = async (field: CustomizationField) => {
    if (!selectedCategory) return;

    try {
      const currentFields = selectedCategory.customizationFields || [];
      const updatedFields = [...currentFields];
      const existingIndex = updatedFields.findIndex((f) => f.key === field.key);

      if (existingIndex >= 0) {
        updatedFields[existingIndex] = field;
      } else {
        updatedFields.push(field);
      }

      const response = await apiRequest('PATCH', `/api/v1/categories/${selectedCategory._id}`, {
        customizationFields: updatedFields,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: 'Customization Saved',
          description: `Customization options successfully updated for ${selectedCategory.name}.`,
        });
        setShowFieldForm(false);
        setEditingField(null);
        setSelectedCategory(data.data);
        await fetchCategories();
      } else {
        throw new Error(data.message || 'Failed to save customization field');
      }
    } catch (error: any) {
      toast({
        title: 'Save Failed',
        description: formatApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteField = async (fieldKey: string) => {
    if (!selectedCategory) return;

    try {
      const currentFields = selectedCategory.customizationFields || [];
      const updatedFields = currentFields.filter((f) => f.key !== fieldKey);

      const response = await apiRequest('PATCH', `/api/v1/categories/${selectedCategory._id}`, {
        customizationFields: updatedFields,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: 'Field Removed',
          description: `Customization field "${fieldKey}" removed.`,
        });
        setSelectedCategory(data.data);
        await fetchCategories();
      } else {
        throw new Error(data.message || 'Failed to delete field');
      }
    } catch (error: any) {
      toast({
        title: 'Delete Failed',
        description: formatApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#B66F72] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[#756861] dark:text-muted-foreground">Loading customizations…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Customization Management — Renu's Collections" noindex />
      <main className="container mx-auto px-4 py-8 pt-20 max-w-6xl">
        <AdminNav className="mb-6" />

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-[#B66F72]/10 dark:bg-primary/10">
            <Settings className="h-5 w-5 text-[#B66F72] dark:text-primary" />
          </div>
          <div>
            <h1 className="font-playfair text-2xl font-semibold text-[#342824] dark:text-foreground">
              Customization Management
            </h1>
            <p className="text-sm text-[#756861] dark:text-muted-foreground mt-0.5">
              Configure customer-selectable options per category (colours, charms, sizes)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Categories List */}
          <Card className="bg-white dark:bg-card border-[#E6D8D0] dark:border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-playfair text-base text-[#342824] dark:text-foreground">
                Categories
              </CardTitle>
              <p className="text-xs text-[#756861] dark:text-muted-foreground">
                Select a category to manage its fields
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categories.map((category) => {
                  const hasFields = category.customizationFields && category.customizationFields.length > 0;
                  const isSelected = selectedCategory?._id === category._id;
                  return (
                    <button
                      key={category._id}
                      onClick={() => setSelectedCategory(category)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-[#B66F72] bg-[#B66F72]/5 dark:bg-primary/10 ring-1 ring-[#B66F72]/20'
                          : 'border-[#E6D8D0] dark:border-border hover:border-[#B66F72]/40 hover:bg-[#F1E6DF]/30 dark:hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-medium text-sm ${isSelected ? 'text-[#B66F72] dark:text-primary' : 'text-[#342824] dark:text-foreground'}`}>
                          {category.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 ${
                            hasFields
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-[#E6D8D0]/50 dark:bg-muted text-[#756861] dark:text-muted-foreground border-[#E6D8D0] dark:border-border'
                          }`}
                        >
                          {hasFields ? 'Active' : 'None'}
                        </Badge>
                      </div>
                      <div className="text-xs text-[#756861] dark:text-muted-foreground mt-1 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        {category.customizationFields?.length || 0} field{(category.customizationFields?.length || 0) !== 1 ? 's' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Customization Fields Panel */}
          <div className="lg:col-span-2">
            {selectedCategory ? (
              <Card className="bg-white dark:bg-card border-[#E6D8D0] dark:border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="font-playfair text-lg text-[#342824] dark:text-foreground">
                          {selectedCategory.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            selectedCategory.customizationFields && selectedCategory.customizationFields.length > 0
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-[#E6D8D0]/50 dark:bg-muted text-[#756861] dark:text-muted-foreground border-[#E6D8D0] dark:border-border'
                          }`}
                        >
                          {selectedCategory.customizationFields && selectedCategory.customizationFields.length > 0
                            ? 'Customization Active'
                            : 'Customization Inactive'}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
                        Configure options for all {selectedCategory.name} pieces
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setEditingField({
                          key: '',
                          label: '',
                          type: 'select',
                          options: [],
                          required: false,
                          sortOrder: (selectedCategory.customizationFields || []).length,
                        });
                        setShowFieldForm(true);
                      }}
                      className="shrink-0 bg-[#B66F72] hover:bg-[#95565A] text-white dark:bg-primary dark:hover:bg-primary/90"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add Field
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedCategory.customizationFields.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-[#E6D8D0] dark:border-border rounded-xl">
                      <Settings className="h-8 w-8 text-[#B66F72]/30 dark:text-primary/30 mx-auto mb-3" />
                      <p className="font-playfair text-[#342824] dark:text-foreground font-medium">No fields configured</p>
                      <p className="text-sm text-[#756861] dark:text-muted-foreground mt-1">
                        Add customization options like colour swatches, charm selections, or size choices.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedCategory.customizationFields
                        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                        .map((field) => (
                          <div
                            key={field.key}
                            className="flex items-start justify-between gap-4 p-4 rounded-xl border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background hover:border-[#B66F72]/30 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-playfair font-semibold text-sm text-[#342824] dark:text-foreground">
                                  {field.label}
                                </h3>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] flex items-center gap-1 px-2 py-0.5 border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground"
                                >
                                  {FIELD_TYPE_ICONS[field.type]}
                                  {field.type}
                                </Badge>
                                {field.required && (
                                  <Badge className="text-[10px] px-2 py-0.5 bg-[#B66F72]/10 text-[#B66F72] dark:bg-primary/10 dark:text-primary border-0">
                                    Required
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1 font-mono">
                                key: {field.key}
                              </p>
                              {field.options && field.options.length > 0 && (
                                <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                                  {field.options.length} option{field.options.length !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingField(field);
                                  setShowFieldForm(true);
                                }}
                                className="border-[#E6D8D0] dark:border-border text-[#342824] dark:text-foreground hover:bg-[#F1E6DF] dark:hover:bg-muted h-8 px-3"
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteField(field.key)}
                                className="text-[#756861] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 h-8 px-3"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[300px] rounded-2xl border-2 border-dashed border-[#E6D8D0] dark:border-border bg-white/50 dark:bg-card/50">
                <div className="text-center">
                  <Settings className="h-10 w-10 text-[#B66F72]/20 dark:text-primary/20 mx-auto mb-3" />
                  <p className="font-playfair text-[#342824] dark:text-foreground font-medium">Select a category</p>
                  <p className="text-sm text-[#756861] dark:text-muted-foreground mt-1">
                    Choose a category on the left to manage its customization fields
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Field Form Modal */}
      {showFieldForm && editingField && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-card border-[#E6D8D0] dark:border-border shadow-xl rounded-2xl">
            <CardHeader className="border-b border-[#E6D8D0] dark:border-border pb-4">
              <CardTitle className="font-playfair text-lg text-[#342824] dark:text-foreground">
                {editingField.key ? 'Edit Field' : 'Add New Field'}
              </CardTitle>
              <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
                Configure a customer-facing customization option
              </p>
            </CardHeader>
            <CardContent className="pt-5">
              <FieldForm
                field={editingField}
                onSave={handleSaveField}
                onCancel={() => {
                  setShowFieldForm(false);
                  setEditingField(null);
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function FieldForm({
  field,
  onSave,
  onCancel,
}: {
  field: CustomizationField;
  onSave: (field: CustomizationField) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<CustomizationField>(field);
  const [newOption, setNewOption] = useState({ value: '', label: '', priceModifier: 0, imageUrl: '' });
  const [colorHex, setColorHex] = useState('#EC4899');
  const [colorLabel, setColorLabel] = useState('');
  const [colorPrice, setColorPrice] = useState(0);
  const [colorImageUrl, setColorImageUrl] = useState('');
  const [editingImageIdx, setEditingImageIdx] = useState<number | null>(null);
  const [tempImageUrl, setTempImageUrl] = useState('');

  const resolveColor = (val: string) => {
    if (!val) return '#cccccc';
    const clean = val.trim();
    if (clean.startsWith('#')) return clean;
    if (/^[0-9A-Fa-f]{3,8}$/.test(clean)) return `#${clean}`;
    return clean;
  };

  const handleAddOption = () => {
    if (!newOption.value.trim() || !newOption.label.trim()) return;
    setFormData({
      ...formData,
      options: [
        ...(formData.options || []),
        {
          value: newOption.value.trim(),
          label: newOption.label.trim(),
          priceModifier: Number(newOption.priceModifier) || 0,
          imageUrl: newOption.imageUrl.trim() || undefined,
        },
      ],
    });
    setNewOption({ value: '', label: '', priceModifier: 0, imageUrl: '' });
  };

  const handleAddColorOption = () => {
    if (!colorLabel.trim() || !colorHex.trim()) return;
    setFormData({
      ...formData,
      options: [
        ...(formData.options || []),
        {
          value: colorHex.trim(),
          label: colorLabel.trim(),
          priceModifier: Number(colorPrice) || 0,
          imageUrl: colorImageUrl.trim() || undefined,
        },
      ],
    });
    setColorLabel('');
    setColorPrice(0);
    setColorImageUrl('');
  };

  const handleRemoveOption = (index: number) => {
    setFormData({
      ...formData,
      options: formData.options?.filter((_, i) => i !== index),
    });
    if (editingImageIdx === index) {
      setEditingImageIdx(null);
      setTempImageUrl('');
    }
  };

  const handleRemoveOptionImage = (index: number) => {
    if (!formData.options) return;
    const updated = [...formData.options];
    delete updated[index].imageUrl;
    setFormData({ ...formData, options: updated });
    if (editingImageIdx === index) {
      setEditingImageIdx(null);
      setTempImageUrl('');
    }
  };

  const handleSaveOptionImage = (index: number) => {
    if (!formData.options) return;
    const updated = [...formData.options];
    const cleanUrl = tempImageUrl.trim();
    if (cleanUrl) {
      updated[index].imageUrl = cleanUrl;
    } else {
      delete updated[index].imageUrl;
    }
    setFormData({ ...formData, options: updated });
    setEditingImageIdx(null);
    setTempImageUrl('');
  };

  const inputCls = "border-[#E6D8D0] dark:border-border bg-white dark:bg-background focus-visible:ring-[#B66F72]/30";
  const labelCls = "text-sm font-medium text-[#342824] dark:text-foreground";

  return (
    <div className="space-y-5">
      {/* Key */}
      <div className="space-y-1.5">
        <Label htmlFor="key" className={labelCls}>Internal Key</Label>
        <Input
          id="key"
          value={formData.key}
          onChange={(e) => setFormData({ ...formData, key: e.target.value.trim() })}
          placeholder="e.g., bead_colour"
          className={inputCls}
        />
        <p className="text-xs text-[#756861] dark:text-muted-foreground">
          System identifier used in logic and database (e.g., <code className="font-mono bg-[#F1E6DF] dark:bg-muted px-1 rounded">bead_colour</code>).
        </p>
      </div>

      {/* Label */}
      <div className="space-y-1.5">
        <Label htmlFor="label" className={labelCls}>Customer Label</Label>
        <Input
          id="label"
          value={formData.label}
          onChange={(e) => setFormData({ ...formData, label: e.target.value })}
          placeholder="e.g., Select Bead Colour"
          className={inputCls}
        />
        <p className="text-xs text-[#756861] dark:text-muted-foreground">
          Shown to customers on the product page, cart, and checkout.
        </p>
      </div>

      {/* Type + Required + Sort */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1 space-y-1.5">
          <Label htmlFor="type" className={labelCls}>Field Type</Label>
          <select
            id="type"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
            className="w-full px-3 py-2 border border-[#E6D8D0] dark:border-border rounded-md bg-white dark:bg-background text-[#342824] dark:text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#B66F72]/30"
          >
            <option value="select">Select (Single)</option>
            <option value="multiselect">Multi-select</option>
            <option value="color">Color Swatches</option>
            <option value="text">Text (free entry)</option>
            <option value="number">Number (free entry)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sortOrder" className={labelCls}>Sort Order</Label>
          <Input
            id="sortOrder"
            type="number"
            value={formData.sortOrder || 0}
            onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
            className={inputCls}
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              id="required"
              checked={formData.required}
              onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
              className="w-4 h-4 rounded accent-[#B66F72]"
            />
            <span className="text-sm font-medium text-[#342824] dark:text-foreground">Required</span>
          </label>
        </div>
      </div>

      {/* Info for text/number */}
      {(formData.type === 'text' || formData.type === 'number') && (
        <div className="p-3.5 bg-[#F1E6DF]/50 dark:bg-muted/30 rounded-xl border border-[#E6D8D0] dark:border-border text-sm">
          <p className="font-medium text-[#342824] dark:text-foreground">
            {formData.type === 'text' ? '✏️ Custom Text Field' : '🔢 Custom Number Field'}
          </p>
          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
            {formData.type === 'text'
              ? 'Customers will type custom text (e.g. name engraving, notes). Preset options are not required.'
              : 'Customers will type a number (e.g. length in cm). Preset options are not required.'}
          </p>
        </div>
      )}

      {/* Color Options */}
      {formData.type === 'color' && (
        <div className="space-y-4 border-t border-[#E6D8D0] dark:border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm text-[#342824] dark:text-foreground flex items-center gap-1.5">
              <Palette className="h-4 w-4 text-[#B66F72] dark:text-primary" />
              Color Swatch Options
            </h3>
            <span className="text-xs text-[#756861] dark:text-muted-foreground">{formData.options?.length || 0} colours</span>
          </div>

          {/* Existing colours */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {formData.options?.map((option, index) => {
              const isEditingThisImage = editingImageIdx === index;
              return (
                <div key={index} className="p-2.5 border border-[#E6D8D0] dark:border-border rounded-lg bg-[#FBF7F3] dark:bg-background space-y-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full border-2 border-[#E6D8D0] dark:border-border shadow-sm shrink-0"
                      style={{ backgroundColor: resolveColor(option.value) }}
                    />
                    
                    {/* Attached Option Image Thumbnail */}
                    {option.imageUrl ? (
                      <div className="relative group shrink-0">
                        <img
                          src={getAssetUrl(option.imageUrl)}
                          alt={option.label}
                          className="w-8 h-8 rounded-md object-cover border border-[#E6D8D0] dark:border-border bg-white"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/logo.png';
                          }}
                        />
                      </div>
                    ) : null}

                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-[#342824] dark:text-foreground truncate block">
                        {option.label}
                      </span>
                      <span className="font-mono text-[10px] text-[#756861] dark:text-muted-foreground">
                        {option.value}
                      </span>
                    </div>

                    {option.priceModifier !== undefined && option.priceModifier !== 0 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {option.priceModifier > 0 ? '+' : ''}₹{option.priceModifier}
                      </Badge>
                    )}

                    {/* Image Action buttons */}
                    {option.imageUrl ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Replace option image"
                          className="h-7 px-1.5 text-xs text-[#756861] hover:text-[#B66F72]"
                          onClick={() => {
                            setEditingImageIdx(isEditingThisImage ? null : index);
                            setTempImageUrl(option.imageUrl || '');
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Remove image from option"
                          className="h-7 px-1.5 text-xs text-[#756861] hover:text-rose-600"
                          onClick={() => handleRemoveOptionImage(index)}
                        >
                          <ImageOff className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="Attach option image"
                        className="h-7 px-2 text-xs text-[#756861] hover:text-[#B66F72] flex items-center gap-1 shrink-0"
                        onClick={() => {
                          setEditingImageIdx(isEditingThisImage ? null : index);
                          setTempImageUrl('');
                        }}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span className="text-[10px] hidden sm:inline">Add Image</span>
                      </Button>
                    )}

                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="text-[#756861] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 h-7 px-2 shrink-0" 
                      onClick={() => handleRemoveOption(index)}
                      title="Delete option"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Inline Image Edit / Replace input */}
                  {isEditingThisImage && (
                    <div className="pt-2 border-t border-[#E6D8D0]/60 dark:border-border/60 flex items-center gap-2">
                      <div className="flex-1">
                        <ImageUploadField
                          compact
                          value={tempImageUrl}
                          onChange={(url) => setTempImageUrl(url)}
                          placeholder="Image URL or upload"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSaveOptionImage(index)}
                        className="h-8 px-2.5 text-xs bg-[#B66F72] text-white hover:bg-[#95565A]"
                        title="Save image"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingImageIdx(null);
                          setTempImageUrl('');
                        }}
                        className="h-8 px-2 text-xs"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add colour form */}
          <div className="p-3.5 bg-[#F1E6DF]/40 dark:bg-muted/20 rounded-xl border border-[#E6D8D0] dark:border-border space-y-3">
            <p className="text-xs font-semibold text-[#756861] dark:text-muted-foreground uppercase tracking-wider">Add Colour Swatch</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  className="w-10 h-10 p-0.5 rounded border border-[#E6D8D0] dark:border-border cursor-pointer shrink-0"
                  title="Pick Color"
                />
                <Input
                  placeholder="#Hex"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  className={`font-mono text-xs ${inputCls}`}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  placeholder="Colour name (e.g. Rose Pink)"
                  value={colorLabel}
                  onChange={(e) => setColorLabel(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <Input
                  type="number"
                  placeholder="+₹ Modifier"
                  value={colorPrice || ''}
                  onChange={(e) => setColorPrice(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Optional Option Image for Color */}
            <div className="pt-1">
              <ImageUploadField
                compact
                value={colorImageUrl}
                onChange={(url) => setColorImageUrl(url)}
                placeholder="Optional Swatch/Bead Image (or paste URL)"
              />
            </div>

            <Button onClick={handleAddColorOption} variant="outline" size="sm" className="w-full border-[#E6D8D0] dark:border-border hover:bg-[#F1E6DF] dark:hover:bg-muted">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Colour Option
            </Button>
          </div>
        </div>
      )}

      {/* Select / Multi-Select Options */}
      {(formData.type === 'select' || formData.type === 'multiselect') && (
        <div className="space-y-4 border-t border-[#E6D8D0] dark:border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm text-[#342824] dark:text-foreground flex items-center gap-1.5">
              <List className="h-4 w-4 text-[#B66F72] dark:text-primary" />
              Selectable Options
            </h3>
            <span className="text-xs text-[#756861] dark:text-muted-foreground">{formData.options?.length || 0} options</span>
          </div>

          {/* Existing options */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {formData.options?.map((option, index) => {
              const isEditingThisImage = editingImageIdx === index;
              return (
                <div key={index} className="p-2.5 border border-[#E6D8D0] dark:border-border rounded-lg bg-[#FBF7F3] dark:bg-background space-y-2">
                  <div className="flex items-center gap-2">
                    {/* Attached Option Image Thumbnail */}
                    {option.imageUrl ? (
                      <img
                        src={getAssetUrl(option.imageUrl)}
                        alt={option.label}
                        className="w-8 h-8 rounded-md object-cover border border-[#E6D8D0] dark:border-border bg-white shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/logo.png';
                        }}
                      />
                    ) : null}

                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-[#342824] dark:text-foreground truncate block">
                        {option.label}
                      </span>
                      <Badge variant="outline" className="text-[10px] border-[#E6D8D0] dark:border-border">
                        {option.value}
                      </Badge>
                    </div>

                    {option.priceModifier !== undefined && option.priceModifier !== 0 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {option.priceModifier > 0 ? '+' : ''}₹{option.priceModifier}
                      </Badge>
                    )}

                    {/* Image Action buttons */}
                    {option.imageUrl ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Replace option image"
                          className="h-7 px-1.5 text-xs text-[#756861] hover:text-[#B66F72]"
                          onClick={() => {
                            setEditingImageIdx(isEditingThisImage ? null : index);
                            setTempImageUrl(option.imageUrl || '');
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Remove image from option"
                          className="h-7 px-1.5 text-xs text-[#756861] hover:text-rose-600"
                          onClick={() => handleRemoveOptionImage(index)}
                        >
                          <ImageOff className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="Attach option image"
                        className="h-7 px-2 text-xs text-[#756861] hover:text-[#B66F72] flex items-center gap-1 shrink-0"
                        onClick={() => {
                          setEditingImageIdx(isEditingThisImage ? null : index);
                          setTempImageUrl('');
                        }}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span className="text-[10px] hidden sm:inline">Add Image</span>
                      </Button>
                    )}

                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="text-[#756861] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 h-7 px-2 shrink-0" 
                      onClick={() => handleRemoveOption(index)}
                      title="Delete option"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Inline Image Edit / Replace input */}
                  {isEditingThisImage && (
                    <div className="pt-2 border-t border-[#E6D8D0]/60 dark:border-border/60 flex items-center gap-2">
                      <div className="flex-1">
                        <ImageUploadField
                          compact
                          value={tempImageUrl}
                          onChange={(url) => setTempImageUrl(url)}
                          placeholder="Image URL or upload"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSaveOptionImage(index)}
                        className="h-8 px-2.5 text-xs bg-[#B66F72] text-white hover:bg-[#95565A]"
                        title="Save image"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingImageIdx(null);
                          setTempImageUrl('');
                        }}
                        className="h-8 px-2 text-xs"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add option form */}
          <div className="p-3.5 bg-[#F1E6DF]/40 dark:bg-muted/20 rounded-xl border border-[#E6D8D0] dark:border-border space-y-3">
            <p className="text-xs font-semibold text-[#756861] dark:text-muted-foreground uppercase tracking-wider">Add Option</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                placeholder="Value (e.g. 18cm, heart)"
                value={newOption.value}
                onChange={(e) => setNewOption({ ...newOption, value: e.target.value })}
                className={inputCls}
              />
              <Input
                placeholder="Customer label (e.g. Heart Charm)"
                value={newOption.label}
                onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                className={inputCls}
              />
              <Input
                type="number"
                placeholder="+₹ Price modifier"
                value={newOption.priceModifier || ''}
                onChange={(e) => setNewOption({ ...newOption, priceModifier: Number(e.target.value) })}
                className={inputCls}
              />
            </div>

            {/* Optional Image for Select / Multiselect Option */}
            <div className="pt-1">
              <ImageUploadField
                compact
                value={newOption.imageUrl}
                onChange={(url) => setNewOption({ ...newOption, imageUrl: url })}
                placeholder="Optional Option Image (or paste URL)"
              />
            </div>

            <Button onClick={handleAddOption} variant="outline" size="sm" className="w-full border-[#E6D8D0] dark:border-border hover:bg-[#F1E6DF] dark:hover:bg-muted">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Option
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-[#E6D8D0] dark:border-border">
        <Button variant="outline" onClick={onCancel} className="border-[#E6D8D0] dark:border-border hover:bg-[#F1E6DF] dark:hover:bg-muted">
          Cancel
        </Button>
        <Button
          onClick={() => onSave(formData)}
          disabled={!formData.key.trim() || !formData.label.trim()}
          className="bg-[#B66F72] hover:bg-[#95565A] text-white dark:bg-primary dark:hover:bg-primary/90"
        >
          Save Field
        </Button>
      </div>
    </div>
  );
}
