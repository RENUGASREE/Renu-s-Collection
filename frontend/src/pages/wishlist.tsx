import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Footer from "../components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { apiRequest, getAssetUrl } from "@/lib/queryClient";
import { SEO } from "@/components/SEO";
import { Heart, Gem, Trash2, PackageX, Sparkles } from "lucide-react";

interface WishlistItem {
  id: string;
  productId: string;
  product: ProductInfo;
  createdAt: string;
}

interface ProductInfo {
  _id: string;
  name: string;
  media?: { url: string; isPrimary: boolean }[];
  price: number;
  effectivePrice: number;
  salePrice?: number | null;
  badge?: string | null;
  isSignaturePiece?: boolean;
}

function WishlistImage({ src, alt }: { src: string; alt: string }) {
  const [hasError, setHasError] = useState(false);
  const placeholderUrl = getAssetUrl("/placeholders/placeholder.png");
  const resolvedSrc = !src || hasError ? placeholderUrl : getAssetUrl(src);

  return (
    <div className="relative w-full aspect-square bg-[#FAF4F1]/60 dark:bg-[#241C1A] overflow-hidden rounded-t-xl flex items-center justify-center">
      {(!src || hasError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60 p-4 text-center select-none">
          <Gem className="h-8 w-8 text-primary/30 mb-1.5" />
          <span className="text-[11px] font-medium tracking-wider uppercase">Jewellery Preview</span>
        </div>
      )}
      <img
        src={resolvedSrc}
        alt={alt}
        loading="lazy"
        onError={() => {
          if (!hasError) {
            setHasError(true);
          }
        }}
        className={`w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 ${
          !src || hasError ? "opacity-0" : "opacity-100"
        }`}
      />
    </div>
  );
}

export default function Wishlist() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchWishlist = async () => {
    if (!user || !token) {
      setError("Please login to view your wishlist");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest("GET", "/api/v1/users/wishlist");
      const data = await response.json();
      setItems(data.data?.items || []);
    } catch (e: any) {
      console.error("Wishlist fetch error:", e);
      setError(e.message || "Failed to load wishlist");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, [user, token]);

  const removeItem = async (id: string, productName?: string) => {
    try {
      const response = await apiRequest("DELETE", `/api/v1/users/wishlist/${id}`);
      if (response.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        toast({
          title: "Removed from Wishlist",
          description: productName
            ? `"${productName}" has been removed from your saved collection.`
            : "Piece removed from your wishlist.",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove item. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SEO
        title="My Wishlist — Renu's Collections"
        description="View your saved handcrafted jewellery pieces at Renu's Collections."
        keywords="wishlist, saved jewelry, luxury jewelry wishlist, renu's collections"
        url="https://renucollections.com/wishlist"
      />

      <main className="flex-grow container mx-auto px-4 py-8 pt-20">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium tracking-widest uppercase mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Saved Pieces</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-playfair font-bold text-foreground mb-3">
            My Wishlist
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Your personal curation of fine jewellery, safely saved for your next memorable occasion.
          </p>
        </div>

        {/* Loading State: Skeleton Cards */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-card border border-border rounded-xl overflow-hidden animate-pulse flex flex-col"
              >
                <div className="w-full aspect-square bg-muted/60" />
                <div className="p-4 space-y-3 flex-grow">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="pt-4 flex gap-2">
                    <div className="h-9 bg-muted rounded flex-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="text-center py-16 bg-card border border-border rounded-2xl max-w-lg mx-auto p-8 shadow-sm">
            <PackageX className="h-12 w-12 text-destructive mx-auto mb-3" />
            <h2 className="text-xl font-playfair font-bold text-foreground mb-2">
              Could Not Load Wishlist
            </h2>
            <p className="text-muted-foreground text-sm mb-6">{error}</p>
            <Button
              onClick={() => (user ? fetchWishlist() : navigate("/login"))}
              variant="outline"
              size="sm"
            >
              {user ? "Try Again" : "Sign In"}
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-16 bg-card border border-border/70 rounded-2xl max-w-lg mx-auto p-8 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Heart className="h-8 w-8 text-primary/60" />
            </div>
            <h2 className="text-2xl font-playfair font-bold text-foreground mb-2">
              Your Wishlist is Empty
            </h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
              You haven't saved any jewellery pieces yet. Explore our handcrafted collections to find your perfect match.
            </p>
            <Button
              onClick={() => navigate("/products")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6"
            >
              Explore Our Collections
            </Button>
          </div>
        )}

        {/* Populated Grid */}
        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((item) => (
              <WishlistCard key={item.id} item={item} onRemove={removeItem} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

function WishlistCard({
  item,
  onRemove,
}: {
  item: WishlistItem;
  onRemove: (id: string, name?: string) => void;
}) {
  const navigate = useNavigate();
  const product = item.product;

  const getProductImage = () => {
    if (!product?.media || product.media.length === 0) return "";
    const primary = product.media.find((m) => m.isPrimary);
    return primary?.url || product.media[0]?.url || "";
  };

  const displayPrice = product?.salePrice ?? product?.effectivePrice ?? product?.price ?? 0;
  const originalPrice = product?.price ?? 0;
  const hasDiscount = product?.salePrice && product.salePrice < originalPrice;

  return (
    <Card className="group flex flex-col bg-card border border-border/70 hover:border-primary/40 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300">
      {/* Product Image & Top Overlays */}
      <div className="relative">
        <div
          onClick={() => navigate(`/product/${item.productId}`)}
          className="cursor-pointer"
        >
          <WishlistImage src={getProductImage()} alt={product?.name || "Jewellery piece"} />
        </div>

        {/* Badge */}
        {product?.badge && (
          <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full shadow-sm z-10 pointer-events-none">
            {product.badge}
          </span>
        )}

        {/* Remove Wishlist Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id, product?.name);
          }}
          aria-label="Remove from wishlist"
          title="Remove from wishlist"
          className="absolute top-3 right-3 p-2 rounded-full bg-white/90 dark:bg-[#1A1413]/90 hover:bg-white dark:hover:bg-[#241C1A] text-foreground shadow-sm hover:shadow-md transition-all duration-200 z-10 group/btn"
        >
          <Heart className="h-4 w-4 fill-primary text-primary transition-transform group-hover/btn:scale-110" />
        </button>
      </div>

      {/* Card Content */}
      <CardContent className="p-4 flex-grow flex flex-col justify-between">
        <div>
          {/* Title */}
          <h2
            onClick={() => navigate(`/product/${item.productId}`)}
            className="font-playfair font-semibold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors cursor-pointer line-clamp-1 mb-2"
            title={product?.name || "Jewellery Piece"}
          >
            {product?.name || "Handcrafted Piece"}
          </h2>

          {/* Price */}
          <div className="mb-4">
            {hasDiscount ? (
              <div className="flex items-baseline gap-2">
                <span className="text-base sm:text-lg font-bold text-primary font-serif">
                  ₹{displayPrice.toLocaleString("en-IN")}
                </span>
                <span className="text-xs text-muted-foreground line-through">
                  ₹{originalPrice.toLocaleString("en-IN")}
                </span>
              </div>
            ) : (
              <span className="text-base sm:text-lg font-bold text-primary font-serif">
                ₹{displayPrice.toLocaleString("en-IN")}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
          <Button
            onClick={() => navigate(`/product/${item.productId}`)}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs sm:text-sm h-9 rounded-md transition-colors"
          >
            View Piece
          </Button>
          <button
            onClick={() => onRemove(item.id, product?.name)}
            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Remove from wishlist</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}