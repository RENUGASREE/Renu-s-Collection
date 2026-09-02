import Footer from "@/components/footer";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { apiRequest, API_BASE_URL } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SEO } from "@/components/SEO";
import { CustomizationPreview } from "@/components/CustomizationPreview";
import { CustomizationControls } from "@/components/CustomizationControls";
import { Card, CardContent } from "@/components/ui/card";

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
}

interface CustomizationField {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'color' | 'text' | 'number';
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
  const [customizationConfig, setCustomizationConfig] = useState<CustomizationConfig | null>(null);
  const [customizationSelections, setCustomizationSelections] = useState<Record<string, string | string[]>>({});
  const [customizationPrice, setCustomizationPrice] = useState<{ basePrice: number; priceModifier: number; totalPrice: number } | null>(null);
  const [showCustomization, setShowCustomization] = useState(false);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await apiRequest('GET', `/api/v1/products/${productId}`);
        const data = await response.json();
        setProduct(data.data);

        // Fetch customization config if product is customizable
        if (data.data.isCustomizable) {
          try {
            const customResponse = await apiRequest('GET', `/api/v1/customization/products/${productId}/customization`);
            const customData = await customResponse.json();
            setCustomizationConfig(customData.data);
            setShowCustomization(true);
          } catch (customErr) {
            console.error('Failed to fetch customization config:', customErr);
          }
        }
      } catch (err) {
        setError("Failed to fetch product details.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchWishlist = async () => {
      if (user) {
        try {
          const response = await apiRequest('GET', '/api/v1/users/wishlist');
          const data = await response.json();
          const ids: Set<string> = new Set((data.data?.productIds || []).map((id: any) => String(id)));
          setWishlistIds(ids);
          setIsInWishlist(ids.has(productId!));
        } catch (err) {
          console.error('Failed to fetch wishlist:', err);
        }
      }
    };

    if (productId) {
      fetchProduct();
      fetchWishlist();
    }
  }, [productId, user]);

  useEffect(() => {
    if (product && Object.keys(customizationSelections).length > 0) {
      const calculatePrice = async () => {
        try {
          const response = await apiRequest('POST', `/api/v1/customization/products/${productId}/customization/calculate-price`, {
            selections: customizationSelections,
          });
          const data = await response.json();
          setCustomizationPrice(data.data);
        } catch (err) {
          console.error('Failed to calculate price:', err);
        }
      };
      calculatePrice();
    }
  }, [customizationSelections, productId, product]);

  const handleCustomizationChange = (key: string, value: string | string[]) => {
    setCustomizationSelections(prev => ({ ...prev, [key]: value }));
  };

  const getProductImage = (product: Product) => {
    const primaryMedia = product.media.find(m => m.isPrimary);
    return primaryMedia?.url || product.media[0]?.url || '';
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
        const validateResponse = await apiRequest('POST', `/api/v1/customization/products/${productId}/customization/validate`, {
          selections: customizationSelections,
        });
        const validateData = await validateResponse.json();
        if (!validateData.data.valid) {
          toast({
            title: "Invalid Customization",
            description: validateData.data.errors.join(', '),
            variant: "destructive",
          });
          return;
        }
      } catch (err) {
        console.error('Validation error:', err);
      }
    }

    setAddingToCart(true);
    try {
      const cartItem = {
        productId: product._id,
        quantity: quantity,
        customization: product.isCustomizable && Object.keys(customizationSelections).length > 0 ? {
          selections: customizationSelections,
          previewImageUrl: customizationConfig?.previewLayers[0]?.imageUrl || getProductImage(product),
          priceModifier: customizationPrice?.priceModifier || 0,
        } : undefined,
      };

      console.log('Adding to cart:', cartItem);
      const response = await apiRequest('POST', '/api/v1/cart', cartItem);
      console.log('Cart response status:', response.status, response.ok);

      if (response.ok) {
        toast({
          title: "Success!",
          description: "Product added to cart successfully",
        });
        console.log('Navigating to cart...');
        navigate("/cart");
      } else {
        const errorData = await response.json();
        console.error('Cart error:', errorData);
        toast({
          title: "Error",
          description: errorData.message || "Failed to add product to cart",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Add to cart error:', error);
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
        const validateResponse = await apiRequest('POST', `/api/v1/customization/products/${productId}/customization/validate`, {
          selections: customizationSelections,
        });
        const validateData = await validateResponse.json();
        if (!validateData.data.valid) {
          toast({
            title: "Invalid Customization",
            description: validateData.data.errors.join(', '),
            variant: "destructive",
          });
          return;
        }
      } catch (err) {
        console.error('Validation error:', err);
      }
    }

    setAddingToCart(true);
    try {
      const cartItem = {
        productId: product._id,
        quantity: quantity,
        customization: product.isCustomizable && Object.keys(customizationSelections).length > 0 ? {
          selections: customizationSelections,
          previewImageUrl: customizationConfig?.previewLayers[0]?.imageUrl || getProductImage(product),
          priceModifier: customizationPrice?.priceModifier || 0,
        } : undefined,
      };

      console.log('Buy Now - Adding to cart:', cartItem);
      const response = await apiRequest('POST', '/api/v1/cart', cartItem);
      console.log('Buy Now - Cart response status:', response.status, response.ok);

      if (response.ok) {
        toast({
          title: "Success!",
          description: "Product added to cart successfully",
        });
        console.log('Navigating to checkout...');
        navigate("/checkout");
      } else {
        const errorData = await response.json();
        console.error('Buy Now - Cart error:', errorData);
        toast({
          title: "Error",
          description: errorData.message || "Failed to add product to cart",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Buy Now - Add to cart error:', error);
      toast({
        title: "Error",
        description: "Failed to add product to cart",
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
        description: "Please login to add items to wishlist",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }
    try {
      const response = await apiRequest('POST', '/api/v1/users/wishlist', {
        productId: product!._id,
      });
      if (response.ok) {
        setIsInWishlist(true);
        setWishlistIds(prev => new Set(prev).add(product!._id));
        toast({
          title: "Added to Wishlist",
          description: "Product added to your wishlist",
        });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to add to wishlist", variant: "destructive" });
    }
  };

  const removeFromWishlist = async () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to manage wishlist",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }
    try {
      const response = await apiRequest('POST', '/api/v1/users/wishlist/remove', {
        productId: product!._id,
      });
      if (response.ok) {
        setIsInWishlist(false);
        setWishlistIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(product!._id);
          return newSet;
        });
        toast({
          title: "Removed from Wishlist",
          description: "Product removed from your wishlist",
        });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove from wishlist", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <>
        <SEO
          title="Loading Product - Renu's Collections"
          description="Loading product details..."
          image="/logo.png"
          type="product"
          keywords="loading, product, Renu's Collections"
          canonicalUrl={`http://localhost:5173/Renu_Collections/product/${productId}`}
        />
        <div className="min-h-screen bg-background flex flex-col">
          <main className="flex-grow container mx-auto px-4 py-8 text-center">
            <h1 className="text-4xl font-bold mb-4">Loading Product...</h1>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Error</h1>
          <p>{error}</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Product Not Found</h1>
          <p>The product you are looking for does not exist.</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Product Image / Preview */}
          <div>
            {showCustomization && customizationConfig ? (
              <div className="aspect-square bg-gray-100 rounded-lg shadow-lg overflow-hidden">
                <CustomizationPreview
                  baseImage={getProductImage(product)}
                  layers={customizationConfig.previewLayers}
                  selections={customizationSelections}
                  className="w-full h-full"
                />
              </div>
            ) : (
              <img
                src={getProductImage(product)}
                alt={product.name}
                className="w-full h-auto rounded-lg shadow-lg"
              />
            )}
          </div>

          {/* Right: Product Details & Customization */}
          <div>
            <h1 className="text-4xl font-bold mb-4">{product.name}</h1>
            
            {/* Price Display */}
            <div className="mb-4">
              {customizationPrice ? (
                <>
                  <p className="text-2xl font-semibold">₹{customizationPrice.totalPrice}</p>
                  <p className="text-sm text-muted-foreground">
                    Base: ₹{customizationPrice.basePrice} + Customization: ₹{customizationPrice.priceModifier}
                  </p>
                </>
              ) : (
                <>
                  {product.salePrice && product.salePrice < product.price ? (
                    <>
                      <p className="text-2xl text-red-600 font-semibold">₹{product.salePrice}</p>
                      <p className="text-lg text-muted-foreground line-through">₹{product.price}</p>
                    </>
                  ) : (
                    <p className="text-2xl font-semibold">₹{product.price}</p>
                  )}
                </>
              )}
            </div>

            <p className="text-lg mb-6">{product.description}</p>
            {product.shortDescription && (
              <p className="text-sm text-muted-foreground mb-6">{product.shortDescription}</p>
            )}

            {/* Customization Section */}
            {showCustomization && customizationConfig && (
              <Card className="mb-6">
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Customize Your {product.name}</h2>
                  <CustomizationControls
                    fields={customizationConfig.fields}
                    selections={customizationSelections}
                    onChange={handleCustomizationChange}
                    disabled={!product.isInStock}
                  />
                </CardContent>
              </Card>
            )}

            {/* Product Details */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Details:</h2>
              <ul className="list-disc list-inside ml-4">
                <li>Stock: {product.isInStock ? `${product.stock} available` : "Out of Stock"}</li>
                {product.badge && <li>Badge: {product.badge}</li>}
                <li>Signature Piece: {product.isSignaturePiece ? "Yes" : "No"}</li>
                {product.materials.length > 0 && <li>Materials: {product.materials.join(", ")}</li>}
                {product.colors.length > 0 && <li>Colors: {product.colors.join(", ")}</li>}
                {product.careInstructions && <li>Care: {product.careInstructions}</li>}
                {product.isCustomizable && <li>✓ Customizable</li>}
              </ul>
            </div>

            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={isInWishlist ? removeFromWishlist : addToWishlist}
                className="flex-1"
              >
                {isInWishlist ? "Remove from Wishlist" : "Add to Wishlist"}
              </Button>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <Button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                variant="outline"
                disabled={!product.isInStock}
              >
                -
              </Button>
              <span className="text-xl">{quantity}</span>
              <Button
                onClick={() => setQuantity(quantity + 1)}
                variant="outline"
                disabled={!product.isInStock || quantity >= product.stock}
              >
                +
              </Button>
              <Button
                className="ml-4"
                onClick={addToCart}
                disabled={!product.isInStock || addingToCart}
              >
                {addingToCart ? "Adding..." : "Add to Cart"}
              </Button>
              <Button
                className="ml-2"
                onClick={buyNow}
                disabled={!product.isInStock || addingToCart}
                variant="default"
              >
                {addingToCart ? "Processing..." : "Buy Now"}
              </Button>
            </div>
            {!product.isInStock && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                This product is currently out of stock
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}