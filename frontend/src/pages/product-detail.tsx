import Footer from "@/components/footer";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { apiRequest, getAssetUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SEO } from "@/components/SEO";
import { CustomizationPreview } from "@/components/CustomizationPreview";
import { CustomizationControls } from "@/components/CustomizationControls";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ReviewList } from "@/components/review-list";
import { ReviewForm } from "@/components/review-form";
import { StarRating } from "@/components/star-rating";
import {
  Heart,
  Gem,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Minus,
  Plus,
  ShoppingBag,
  CreditCard,
  PackageX,
  Check,
  Palette,
} from "lucide-react";

interface Product {
  _id: string;
  name: string;
  description: string;
  shortDescription?: string;
  price: number;
  effectivePrice: number;
  salePrice: number | null;
  media: { url: string; isPrimary: boolean }[];
  categoryId: string;
  subcategoryId: string | null;
  stock: number;
  isInStock: boolean;
  badge: string | null;
  isSignaturePiece: boolean;
  signatureCategory: string;
  materials: string[];
  colors: string[];
  careInstructions?: string;
  materialInfo?: string;
  isCustomizable: boolean;
  averageRating?: number;
  reviewCount?: number;
}

interface CustomizationField {
  key: string;
  label: string;
  type: "select" | "multiselect" | "color" | "text" | "number";
  options?: { value: string; label: string; priceModifier?: number; imageUrl?: string }[];
  required?: boolean;
  sortOrder?: number;
}

interface CustomizationConfig {
  productId: string;
  productName: string;
  basePrice: number;
  fields: CustomizationField[];
  previewLayers: { layerId: string; imageUrl: string; zIndex: number; linkedFieldKey?: string }[];
  isCustomizable: boolean;
}

export default function ProductDetail() {
  const { productId } = useParams<{ productId: string }>();
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageHasError, setImageHasError] = useState<Record<number, boolean>>({});

  const [customizationConfig, setCustomizationConfig] = useState<CustomizationConfig | null>(null);
  const [customizationSelections, setCustomizationSelections] = useState<Record<string, string | string[]>>({});
  const [customizationPrice, setCustomizationPrice] = useState<{
    basePrice: number;
    priceModifier: number;
    totalPrice: number;
    breakdown?: { field: string; option: string; modifier: number }[];
  } | null>(null);
  const [hasCustomizationAvailable, setHasCustomizationAvailable] = useState(false);
  const [customizationMode, setCustomizationMode] = useState<'standard' | 'customized'>('standard');
  const showCustomization = customizationMode === 'customized';
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [, setWishlistIds] = useState<Set<string>>(new Set());
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [showCartConfirmation, setShowCartConfirmation] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchProduct = useCallback(async () => {
    if (!productId) return;
    try {
      const response = await apiRequest("GET", `/api/v1/products/${productId}`);
      if (!response.ok) {
        setError("Product not found");
        setProduct(null);
        return;
      }
      const data = await response.json();
      if (!data.data) {
        setError("Product not found");
        setProduct(null);
        return;
      }
      setProduct(data.data);

      // Select primary image index initially
      if (data.data?.media && data.data.media.length > 0) {
        const primaryIdx = data.data.media.findIndex((m: any) => m.isPrimary);
        setSelectedImageIndex(primaryIdx >= 0 ? primaryIdx : 0);
      }

      // Fetch customization config only if product is customizable
      if (data.data?.isCustomizable) {
        try {
          const customResponse = await apiRequest(
            "GET",
            `/api/v1/customization/products/${productId}/customization`
          );
          if (customResponse.ok) {
            const customData = await customResponse.json();
            if (customData.data?.fields && customData.data.fields.length > 0) {
              setCustomizationConfig(customData.data);
              setHasCustomizationAvailable(true);
            } else {
              setCustomizationConfig(null);
              setHasCustomizationAvailable(false);
            }
          } else {
            setCustomizationConfig(null);
            setHasCustomizationAvailable(false);
          }
        } catch {
          setCustomizationConfig(null);
          setHasCustomizationAvailable(false);
        }
      } else {
        setCustomizationConfig(null);
        setHasCustomizationAvailable(false);
      }
    } catch (err) {
      setError("Failed to fetch product details.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  const fetchWishlist = useCallback(async () => {
    if (user && productId) {
      try {
        const response = await apiRequest("GET", "/api/v1/users/wishlist");
        const data = await response.json();
        const ids: Set<string> = new Set((data.data?.productIds || []).map((id: any) => String(id)));
        setWishlistIds(ids);
        setIsInWishlist(ids.has(productId));
      } catch (err) {
        console.error("Failed to fetch wishlist:", err);
      }
    }
  }, [user, productId]);

  useEffect(() => {
    fetchProduct();
    fetchWishlist();
  }, [fetchProduct, fetchWishlist]);

  useEffect(() => {
    if (product && customizationMode === 'customized' && Object.keys(customizationSelections).length > 0) {
      const calculatePrice = async () => {
        try {
          const response = await apiRequest(
            "POST",
            `/api/v1/customization/products/${productId}/customization/calculate-price`,
            {
              selections: customizationSelections,
            }
          );
          const data = await response.json();
          setCustomizationPrice(data.data);
        } catch (err) {
          console.error("Failed to calculate price:", err);
        }
      };
      calculatePrice();
    } else if (customizationMode === 'standard') {
      setCustomizationPrice(null);
    }
  }, [customizationSelections, productId, product, customizationMode]);

  const handleCustomizationChange = (key: string, value: string | string[]) => {
    setCustomizationSelections((prev) => ({ ...prev, [key]: value }));
  };

  const getProductImage = (prod: Product, index = selectedImageIndex) => {
    if (!prod.media || prod.media.length === 0) return "";
    const selected = prod.media[index];
    if (selected?.url) return selected.url;
    const primaryMedia = prod.media.find((m) => m.isPrimary);
    return primaryMedia?.url || prod.media[0]?.url || "";
  };

  const addToCart = async () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to add items to your cart",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    if (!product || !product.isInStock || product.stock < quantity) {
      toast({
        title: "Out of Stock",
        description: "This product is currently out of stock",
        variant: "destructive",
      });
      return;
    }

    // Validate customization if product is customizable
    if (product.isCustomizable && showCustomization) {
      try {
        const validateResponse = await apiRequest(
          "POST",
          `/api/v1/customization/products/${productId}/customization/validate`,
          {
            selections: customizationSelections,
          }
        );
        const validateData = await validateResponse.json();
        if (!validateData.data.valid) {
          toast({
            title: "Invalid Customization",
            description: validateData.data.errors.join(", "),
            variant: "destructive",
          });
          return;
        }
      } catch (err) {
        console.error("Validation error:", err);
      }
    }

    setAddingToCart(true);
    try {
      const cartItem = {
        productId: product._id,
        quantity: quantity,
        customization:
          product.isCustomizable && customizationMode === 'customized' && Object.keys(customizationSelections).length > 0
            ? {
                selections: customizationSelections,
                previewImageUrl:
                  customizationConfig?.previewLayers[0]?.imageUrl || getProductImage(product, 0),
                priceModifier: customizationPrice?.priceModifier || 0,
                breakdown: customizationPrice?.breakdown || [],
              }
            : undefined,
      };

      const response = await apiRequest("POST", "/api/v1/cart", cartItem);

      if (response.ok) {
        setShowCartConfirmation(true);
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to add product to cart",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Add to cart error:", err);
      toast({
        title: "Error",
        description: "Failed to add product to cart",
        variant: "destructive",
      });
    } finally {
      setAddingToCart(false);
    }
  };

  const buyNow = async () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to purchase this product",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    if (!product || !product.isInStock || product.stock < quantity) {
      toast({
        title: "Out of Stock",
        description: "This product is currently out of stock",
        variant: "destructive",
      });
      return;
    }

    // Validate customization if product is customizable
    if (product.isCustomizable && showCustomization) {
      try {
        const validateResponse = await apiRequest(
          "POST",
          `/api/v1/customization/products/${productId}/customization/validate`,
          {
            selections: customizationSelections,
          }
        );
        const validateData = await validateResponse.json();
        if (!validateData.data.valid) {
          toast({
            title: "Invalid Customization",
            description: validateData.data.errors.join(", "),
            variant: "destructive",
          });
          return;
        }
      } catch (err) {
        console.error("Validation error:", err);
      }
    }

    setAddingToCart(true);
    try {
      const cartItem = {
        productId: product._id,
        quantity: quantity,
        customization:
          product.isCustomizable && customizationMode === 'customized' && Object.keys(customizationSelections).length > 0
            ? {
                selections: customizationSelections,
                previewImageUrl:
                  customizationConfig?.previewLayers[0]?.imageUrl || getProductImage(product, 0),
                priceModifier: customizationPrice?.priceModifier || 0,
                breakdown: customizationPrice?.breakdown || [],
              }
            : undefined,
      };

      const response = await apiRequest("POST", "/api/v1/cart", cartItem);

      if (response.ok) {
        toast({
          title: "Proceeding to Checkout",
          description: `"${product.name}" ready for purchase.`,
        });
        navigate("/checkout");
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to proceed to checkout",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Buy Now error:", err);
      toast({
        title: "Error",
        description: "Failed to proceed to checkout",
        variant: "destructive",
      });
    } finally {
      setAddingToCart(false);
    }
  };

  const addToWishlist = async () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to save items to your wishlist",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }
    try {
      const response = await apiRequest("POST", "/api/v1/users/wishlist", {
        productId: product!._id,
      });
      if (response.ok) {
        setIsInWishlist(true);
        setWishlistIds((prev) => new Set(prev).add(product!._id));
        toast({
          title: "Saved to Wishlist",
          description: `"${product?.name}" saved to your personal collection.`,
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to add to wishlist", variant: "destructive" });
    }
  };

  const removeFromWishlist = async () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to manage your wishlist",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }
    try {
      const response = await apiRequest("POST", "/api/v1/users/wishlist/remove", {
        productId: product!._id,
      });
      if (response.ok) {
        setIsInWishlist(false);
        setWishlistIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(product!._id);
          return newSet;
        });
        toast({
          title: "Removed from Wishlist",
          description: `"${product?.name}" removed from your saved pieces.`,
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to remove from wishlist", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEO
          title="Loading Product — Renu's Collections"
          description="Loading handcrafted jewellery piece details..."
          image="/logo.png"
          type="product"
          keywords="jewelry, boutique, renu's collections"
          canonicalUrl={`https://renucollections.com/product/${productId}`}
        />
        <main className="flex-grow container mx-auto px-4 py-8 pt-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-4" />
          <h1 className="text-2xl font-playfair font-bold text-foreground mb-2">Loading Piece...</h1>
          <p className="text-muted-foreground text-sm">Retrieving bespoke craftsmanship details.</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEO
          title="Piece Not Found — Renu's Collections"
          description="The requested jewellery piece could not be found."
          canonicalUrl={`https://renucollections.com/product/${productId}`}
        />
        <main className="flex-grow container mx-auto px-4 py-8 pt-20 flex flex-col items-center justify-center text-center">
          <div className="p-8 bg-card border border-border/70 rounded-2xl max-w-md w-full shadow-sm">
            <PackageX className="h-12 w-12 text-destructive mx-auto mb-3" />
            <h1 className="text-2xl font-playfair font-bold text-foreground mb-2">
              {error || "Piece Not Found"}
            </h1>
            <p className="text-muted-foreground text-sm mb-6">
              The jewellery piece you are looking for may have been archived or is temporarily unavailable.
            </p>
            <Button
              onClick={() => navigate("/products")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            >
              Browse Catalogue
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const currentMediaUrl = getProductImage(product, selectedImageIndex);
  const isSelectedImageBroken = !currentMediaUrl || !!imageHasError[selectedImageIndex];
  const placeholderUrl = getAssetUrl("/placeholders/placeholder.png");
  const mainImageSrc = isSelectedImageBroken ? placeholderUrl : getAssetUrl(currentMediaUrl);

  const displayPrice = customizationPrice
    ? customizationPrice.totalPrice
    : product.salePrice && product.salePrice < product.price
    ? product.salePrice
    : product.price;

  const originalPrice = product.price;
  const hasDiscount = !customizationPrice && product.salePrice && product.salePrice < originalPrice;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SEO
        title={`${product.name} — Renu's Collections`}
        description={product.shortDescription || product.description}
        image={getProductImage(product, 0) || "/logo.png"}
        type="product"
        keywords={`${product.name}, jewelry, luxury jewelry, handcrafted jewelry, renu's collections`}
        canonicalUrl={`https://renucollections.com/product/${productId}`}
      />

      <main className="flex-grow container mx-auto px-4 py-8 pt-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Left: Product Image Gallery / Preview */}
          <div className="space-y-4">
            {showCustomization && customizationConfig ? (
              <div className="aspect-square bg-[#FAF4F1]/60 dark:bg-[#241C1A] rounded-2xl border border-border/70 shadow-sm overflow-hidden flex items-center justify-center relative">
                <CustomizationPreview
                  baseImage={getProductImage(product, 0)}
                  layers={customizationConfig.previewLayers}
                  selections={customizationSelections}
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="relative aspect-square bg-[#FAF4F1]/60 dark:bg-[#241C1A] rounded-2xl border border-border/70 shadow-sm overflow-hidden flex items-center justify-center group">
                {/* Fallback preview indicator */}
                {isSelectedImageBroken && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60 p-4 text-center select-none z-0">
                    <Gem className="h-12 w-12 text-primary/30 mb-2" />
                    <span className="text-xs font-medium tracking-wider uppercase">Jewellery Preview</span>
                  </div>
                )}
                <img
                  src={mainImageSrc}
                  alt={product.name}
                  loading="eager"
                  onError={() => {
                    setImageHasError((prev) => ({ ...prev, [selectedImageIndex]: true }));
                  }}
                  className={`w-full h-full object-contain p-4 transition-transform duration-500 ease-out group-hover:scale-105 ${
                    isSelectedImageBroken ? "opacity-0" : "opacity-100"
                  }`}
                />

                {/* Badge Overlay */}
                {product.badge && (
                  <span className="absolute top-4 left-4 bg-primary text-primary-foreground text-[11px] font-semibold tracking-wider uppercase px-3 py-1 rounded-full shadow-sm z-10 pointer-events-none">
                    {product.badge}
                  </span>
                )}
              </div>
            )}

            {/* Selectable Thumbnails Gallery */}
            {product.media && product.media.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                {product.media.map((med, idx) => {
                  const isThumbBroken = !med.url || !!imageHasError[idx];
                  const thumbSrc = isThumbBroken ? placeholderUrl : getAssetUrl(med.url);
                  const isSelected = idx === selectedImageIndex;

                  return (
                    <button
                      key={idx}
                      type="button"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedImageIndex(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedImageIndex(idx);
                        }
                      }}
                      aria-label={`View image ${idx + 1} of ${product.name}`}
                      className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 bg-[#FAF4F1]/60 dark:bg-[#241C1A] flex items-center justify-center ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/30 scale-105"
                          : "border-border/70 hover:border-primary/50 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={thumbSrc}
                        alt={`${product.name} thumbnail ${idx + 1}`}
                        onError={() => setImageHasError((prev) => ({ ...prev, [idx]: true }))}
                        className="w-full h-full object-contain p-1"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Product Details & Controls */}
          <div className="space-y-6">
            <div>
              {/* Category / Signature pill */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {product.isSignaturePiece && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                    <Sparkles className="h-3 w-3" />
                    Signature Piece
                  </span>
                )}
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                  Refined Collection
                </span>
              </div>

              {/* Heading */}
              <h1 className="text-3xl sm:text-4xl font-playfair font-bold text-foreground mb-3">
                {product.name}
              </h1>

              {/* Rating Summary */}
              {product.averageRating ? (
                <div className="flex items-center gap-2.5 mb-3">
                  <StarRating rating={product.averageRating} size={18} showValue />
                  <span className="text-xs text-muted-foreground">
                    ({product.reviewCount} {product.reviewCount === 1 ? "review" : "reviews"})
                  </span>
                </div>
              ) : null}

              {/* Price Display */}
              <div className="mt-2">
                {customizationPrice ? (
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-bold font-serif text-primary">
                        ₹{customizationPrice.totalPrice.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Base Piece: ₹{customizationPrice.basePrice.toLocaleString("en-IN")} + Customization: ₹
                      {customizationPrice.priceModifier.toLocaleString("en-IN")}
                    </p>
                  </div>
                ) : hasDiscount ? (
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl sm:text-4xl font-bold font-serif text-primary">
                      ₹{displayPrice.toLocaleString("en-IN")}
                    </span>
                    <span className="text-lg text-muted-foreground line-through">
                      ₹{originalPrice.toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                      Special Value
                    </span>
                  </div>
                ) : (
                  <span className="text-3xl sm:text-4xl font-bold font-serif text-primary">
                    ₹{displayPrice.toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="text-muted-foreground space-y-2 text-sm sm:text-base leading-relaxed">
              <p>{product.description}</p>
              {product.shortDescription && (
                <p className="text-xs sm:text-sm text-muted-foreground/80 italic">
                  {product.shortDescription}
                </p>
              )}
            </div>

            {/* Customization Section */}
            {/* Customization Mode Toggle */}
            {hasCustomizationAvailable && (
              <div className="flex gap-2 mb-4">
                <button
                  className={`px-4 py-2 rounded ${customizationMode === 'standard' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                  onClick={() => {
                    setCustomizationMode('standard');
                    setCustomizationSelections({});
                    setCustomizationPrice(null);
                  }}
                >
                  Buy as Shown
                </button>
                <button
                  className={`px-4 py-2 rounded ${customizationMode === 'customized' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                  onClick={() => setCustomizationMode('customized')}
                >
                  Personalize This Piece
                </button>
              </div>
            )}

            {showCustomization && customizationConfig && (
              <Card className="border border-border/70 bg-card shadow-sm rounded-xl overflow-hidden">
                <CardContent className="p-5 sm:p-6 space-y-4">
                  <div className="border-b border-border/50 pb-3">
                    <h2 className="text-lg font-playfair font-semibold text-foreground">
                      Bespoke Personalization
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Customize options to craft your signature jewellery piece.
                    </p>
                  </div>
                  <CustomizationControls
                    fields={customizationConfig.fields}
                    selections={customizationSelections}
                    onChange={handleCustomizationChange}
                    disabled={!product.isInStock}
                  />
                </CardContent>
              </Card>
            )}

            {/* Out of Stock Notice */}
            {!product.isInStock && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium px-4 py-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>This exclusive piece is currently out of stock.</span>
              </div>
            )}

            {/* Shopping Controls */}
            <div className="space-y-3 pt-2">
              {/* Row 1: Quantity selector & Wishlist button */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 border border-border rounded-lg p-1 bg-background">
                  <span className="text-xs text-muted-foreground px-2 font-medium">Qty</span>
                  <Button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-foreground hover:bg-muted"
                    disabled={!product.isInStock || quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
                  <Button
                    onClick={() => setQuantity(quantity + 1)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-foreground hover:bg-muted"
                    disabled={!product.isInStock || quantity >= product.stock}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Wishlist Button */}
                <Button
                  variant="outline"
                  onClick={isInWishlist ? removeFromWishlist : addToWishlist}
                  className="gap-2 border-border/80 hover:border-primary text-xs sm:text-sm h-10 px-4 rounded-lg"
                >
                  <Heart
                    className={`h-4 w-4 transition-colors ${
                      isInWishlist ? "fill-primary text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span>{isInWishlist ? "In Wishlist" : "Save Piece"}</span>
                </Button>
              </div>

              {/* Row 2: Add to Cart & Buy Now Actions (Responsive Grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <Button
                  onClick={addToCart}
                  disabled={!product.isInStock || addingToCart}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-lg gap-2 text-sm shadow-sm transition-all"
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>{addingToCart ? "Adding to Bag..." : "Add to Shopping Bag"}</span>
                </Button>

                <Button
                  onClick={buyNow}
                  disabled={!product.isInStock || addingToCart}
                  variant="secondary"
                  className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium h-11 rounded-lg gap-2 text-sm border border-border/60 transition-all"
                >
                  <CreditCard className="h-4 w-4" />
                  <span>{addingToCart ? "Processing..." : "Buy Now"}</span>
                </Button>
              </div>
            </div>

            {/* Specifications Card */}
            <div className="pt-4 border-t border-border/60">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-3">
                Piece Specifications
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-card/60 border border-border/40">
                  <span className="text-muted-foreground">Availability</span>
                  <span className="font-medium text-foreground">
                    {product.isInStock ? `${product.stock} available` : "Out of stock"}
                  </span>
                </div>

                {product.materials.length > 0 && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-card/60 border border-border/40">
                    <span className="text-muted-foreground">Materials</span>
                    <span className="font-medium text-foreground">{product.materials.join(", ")}</span>
                  </div>
                )}

                {product.colors.length > 0 && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-card/60 border border-border/40">
                    <span className="text-muted-foreground">Tones & Finishes</span>
                    <span className="font-medium text-foreground">{product.colors.join(", ")}</span>
                  </div>
                )}

                {product.isCustomizable && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-card/60 border border-border/40">
                    <span className="text-muted-foreground">Customization</span>
                    <span className="font-medium text-primary inline-flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Bespoke Supported
                    </span>
                  </div>
                )}

                {product.careInstructions && (
                  <div className="sm:col-span-2 flex items-start justify-between p-2.5 rounded-lg bg-card/60 border border-border/40 gap-2">
                    <span className="text-muted-foreground shrink-0">Care Advice</span>
                    <span className="font-medium text-foreground text-right">
                      {product.careInstructions}
                    </span>
                  </div>
                )}
              </div>

              {/* Boutique Assurance Note */}
              <div className="mt-4 p-3 rounded-xl bg-secondary/30 border border-border/40 flex items-center gap-2.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Every piece is individually handcrafted and verified for supreme gemstone integrity.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Reviews Section */}
        <div className="mt-16 pt-10 border-t border-border/60">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-playfair font-bold text-foreground">
                Customer Reviews
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Authentic thoughts and impressions from our patrons.
              </p>
            </div>
            {user && (
              <Button
                variant={showReviewForm ? "outline" : "default"}
                onClick={() => setShowReviewForm(!showReviewForm)}
                className="text-xs sm:text-sm rounded-lg"
              >
                {showReviewForm ? "Cancel Review" : "Write a Review"}
              </Button>
            )}
          </div>

          {showReviewForm && (
            <div className="mb-10 max-w-2xl">
              <ReviewForm
                productId={productId!}
                onSuccess={() => {
                  setShowReviewForm(false);
                  setReviewRefreshKey((prev) => prev + 1);
                  fetchProduct();
                }}
                onCancel={() => setShowReviewForm(false)}
              />
            </div>
          )}

          <ReviewList productId={productId!} refreshTrigger={reviewRefreshKey} />
        </div>
      </main>

      {/* Add to Cart Confirmation Dialog */}
      <Dialog open={showCartConfirmation} onOpenChange={setShowCartConfirmation}>
        <DialogContent className="sm:max-w-md bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#B66F72]/10 dark:bg-primary/10">
              <Check className="h-6 w-6 text-[#B66F72] dark:text-primary" />
            </div>
            <DialogTitle className="font-playfair text-xl text-[#342824] dark:text-foreground">
              Added to Your Shopping Bag!
            </DialogTitle>
            <DialogDescription className="text-[#756861] dark:text-muted-foreground">
              Your selected piece has been added successfully.
            </DialogDescription>
          </DialogHeader>

          {product && (
            <div className="flex items-center gap-4 rounded-lg border border-[#E6D8D0] dark:border-border bg-white dark:bg-background p-3 my-2">
              <img
                src={getAssetUrl(getProductImage(product, 0))}
                alt={product.name}
                className="h-16 w-16 rounded-md object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/logo.png';
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-playfair font-semibold text-sm text-[#342824] dark:text-foreground truncate">
                  {product.name}
                </p>
                <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                  Qty: {quantity}
                </p>
                <p className="text-sm font-semibold text-[#B66F72] dark:text-primary mt-0.5">
                  ₹{((product.effectivePrice + (customizationMode === 'customized' && customizationPrice ? customizationPrice.priceModifier : 0)) * quantity).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1 border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF] dark:hover:bg-muted"
              onClick={() => setShowCartConfirmation(false)}
            >
              Continue Shopping
            </Button>
            <Button
              className="flex-1 bg-[#B66F72] hover:bg-[#95565A] text-white dark:bg-primary dark:hover:bg-primary/90 dark:text-primary-foreground"
              onClick={() => {
                setShowCartConfirmation(false);
                navigate('/cart');
              }}
            >
              <ShoppingBag className="mr-2 h-4 w-4" />
              View Cart
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}