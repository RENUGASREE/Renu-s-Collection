import { useState, useEffect } from "react";
import { apiRequest, getAssetUrl } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  ChevronDown,
  RotateCcw,
  Heart,
  Gem,
  SlidersHorizontal,
  PackageX,
  Sparkles,
} from "lucide-react";

interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  effectivePrice: number;
  salePrice: number | null;
  media: { url: string; isPrimary: boolean }[];
  isSignaturePiece: boolean;
  signatureCategory: string;
  categoryId: string;
  subcategoryId: string | null;
  stock: number;
  isInStock: boolean;
  badge: string | null;
}

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productType: string;
  isActive: boolean;
  sortOrder: number;
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
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
            console.warn(`[Asset Issue] Missing or broken product image for "${alt}": ${src || "(empty URL)"}`);
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

export default function Products() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLabel, setFilterLabel] = useState("All Categories");
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // Handle URL parameters for filtering
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filterParam = params.get("filter");
    if (filterParam) {
      setFilterCategory(filterParam);
      const cat = categories.find((c) => c._id === filterParam || c.slug === filterParam);
      setFilterLabel(cat ? cat.name : filterParam);
    }
  }, [location.search, categories]);

  const addToCart = async (
    productId: string,
    productName: string,
    productPrice: number,
    productImage: string
  ) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        toast({
          title: "Sign In Required",
          description: "Please log in to add items to your shopping bag.",
        });
        navigate("/login");
        return;
      }

      const response = await apiRequest("POST", "/api/v1/cart", {
        productId,
        quantity: 1,
      });

      if (response.ok) {
        toast({
          title: "Added to Bag",
          description: `"${productName}" has been added to your shopping bag.`,
        });
      } else {
        toast({
          title: "Could Not Add Item",
          description: "Failed to add to cart. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to add to cart:", error);
      toast({
        title: "Could Not Add Item",
        description: "Failed to add to cart. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      toast({
        title: "Sign In Required",
        description: "Please log in to save pieces to your wishlist.",
      });
      navigate("/login");
      return;
    }
    try {
      if (wishlistIds.has(productId)) {
        const response = await apiRequest("POST", "/api/v1/users/wishlist/remove", { productId });
        if (response.ok) {
          setWishlistIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(productId);
            return newSet;
          });
          toast({
            title: "Removed from Wishlist",
            description: "Piece removed from your saved collection.",
          });
        }
      } else {
        const response = await apiRequest("POST", "/api/v1/users/wishlist", { productId });
        if (response.ok) {
          setWishlistIds((prev) => new Set(prev).add(productId));
          toast({
            title: "Saved to Wishlist",
            description: "Piece saved to your personal collection.",
          });
        }
      }
    } catch (error) {
      console.error("Failed to toggle wishlist:", error);
      toast({
        title: "Wishlist Error",
        description: "Could not update your wishlist. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await apiRequest("GET", "/api/v1/categories?active=true&menu=true");
        const data = await response.json();
        setCategories(data.data || []);
      } catch (err) {
        console.error("Failed to fetch categories", err);
      }
    };
    fetchCategories();
  }, []);

  // Build category tree for dropdown
  const categoryTree = categories
    .filter((c) => c.parentId === null || c.parentId === undefined)
    .map((parent) => ({
      ...parent,
      subcategories: categories.filter((c) => {
        const parentId = c.parentId ? String(c.parentId) : null;
        return parentId === parent._id;
      }),
    }));

  useEffect(() => {
    const fetchWishlist = async () => {
      if (user) {
        try {
          const response = await apiRequest("GET", "/api/v1/users/wishlist");
          const data = await response.json();
          const ids: Set<string> = new Set((data.data?.productIds || []).map((id: any) => String(id)));
          setWishlistIds(ids);
        } catch (err) {
          console.error("Failed to fetch wishlist:", err);
        }
      }
    };
    fetchWishlist();
  }, [user]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        let url = "/api/v1/products";
        const params = new URLSearchParams();

        if (filterCategory !== "all") {
          if (filterCategory === "signature_all") {
            params.append("isSignaturePiece", "true");
          } else {
            const cat = categories.find((c) => c._id === filterCategory || c.slug === filterCategory);
            if (cat) {
              if (cat.parentId) {
                params.append("subcategoryId", cat._id);
              } else {
                params.append("categoryId", cat._id);
              }
            }
          }
        }

        if (searchTerm.trim()) {
          params.append("q", searchTerm.trim());
        }

        if (params.toString()) {
          url += `?${params.toString()}`;
        }

        const response = await apiRequest("GET", url);
        const data = await response.json();
        setAllProducts(data.data || []);
      } catch (err) {
        console.error("Error fetching products:", err);
        setError("Failed to load products");
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [filterCategory, searchTerm, categories]);

  const getProductImage = (product: Product) => {
    const primaryMedia = product.media.find((m) => m.isPrimary);
    return primaryMedia?.url || product.media[0]?.url || "";
  };

  const getCategoryName = (product: Product) => {
    const cat = categories.find((c) => c._id === product.categoryId);
    return cat?.name || "Boutique Collection";
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterCategory("all");
    setFilterLabel("All Categories");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SEO
        title="Our Jewellery Collections - Renu's Collections"
        description="Discover our exquisite collection of luxury jewellery. Shop from our curated selection of premium bracelets, earrings, and bangles."
        keywords="luxury jewellery, bracelets, earrings, bangles, custom jewellery, kundan jewellery"
        url="https://renucollections.com/products"
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 flex-grow">
        {/* Editorial Boutique Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-primary text-xs font-semibold uppercase tracking-widest block mb-2">
            Curated Elegance
          </span>
          <h1 className="text-4xl sm:text-5xl font-playfair font-bold text-foreground tracking-tight mb-3">
            Our Collections
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base font-light leading-relaxed">
            Exquisitely handcrafted jewellery pieces, designed with timeless devotion and uncompromising artistry.
          </p>
          <div className="w-16 h-0.5 bg-primary/40 mx-auto mt-4 rounded-full" />
        </div>

        {/* Refined Search and Filter Toolbar */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm mb-10 space-y-3.5">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search Input with Icon */}
            <div className="relative flex-grow">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by piece name, gemstone, style..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10 bg-background border-border focus-visible:ring-primary text-sm"
              />
            </div>

            {/* Category Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="min-w-[190px] h-10 justify-between border-border bg-background hover:bg-secondary text-sm font-medium"
                >
                  <span className="truncate">{filterLabel}</span>
                  <ChevronDown className="h-4 w-4 ml-2 opacity-60 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto">
                <DropdownMenuItem
                  onClick={() => {
                    setFilterCategory("all");
                    setFilterLabel("All Categories");
                  }}
                >
                  All Categories
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setFilterCategory("signature_all");
                    setFilterLabel("Signature Pieces");
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" />
                  Signature Pieces
                </DropdownMenuItem>
                {categoryTree.map((cat) =>
                  cat.subcategories.length > 0 ? (
                    <DropdownMenuSub key={cat._id}>
                      <DropdownMenuSubTrigger>{cat.name}</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem
                          onClick={() => {
                            setFilterCategory(cat._id);
                            setFilterLabel(`All ${cat.name}`);
                          }}
                        >
                          All {cat.name}
                        </DropdownMenuItem>
                        {cat.subcategories.map((sub) => (
                          <DropdownMenuItem
                            key={sub._id}
                            onClick={() => {
                              setFilterCategory(sub._id);
                              setFilterLabel(sub.name);
                            }}
                          >
                            {sub.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : (
                    <DropdownMenuItem
                      key={cat._id}
                      onClick={() => {
                        setFilterCategory(cat._id);
                        setFilterLabel(cat.name);
                      }}
                    >
                      {cat.name}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Reset Button */}
            {(searchTerm || filterCategory !== "all") && (
              <Button
                variant="ghost"
                onClick={handleResetFilters}
                className="h-10 text-muted-foreground hover:text-foreground hover:bg-secondary text-sm gap-1.5 shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>

          {/* Quick Filter Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 text-xs no-scrollbar">
            <span className="text-muted-foreground font-medium text-xs whitespace-nowrap mr-1 flex items-center gap-1">
              <SlidersHorizontal className="h-3 w-3" /> Quick Filter:
            </span>
            <button
              onClick={() => {
                setFilterCategory("all");
                setFilterLabel("All Categories");
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
                filterCategory === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => {
                setFilterCategory("signature_all");
                setFilterLabel("Signature Pieces");
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 ${
                filterCategory === "signature_all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3 w-3" /> Signature Pieces
            </button>
            {categoryTree.map((cat) => (
              <button
                key={cat._id}
                onClick={() => {
                  setFilterCategory(cat._id);
                  setFilterLabel(cat.name);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
                  filterCategory === cat._id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State: Skeleton Cards */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-card border border-border rounded-xl overflow-hidden animate-pulse flex flex-col"
              >
                <div className="w-full aspect-square bg-muted/60" />
                <div className="p-4 space-y-3 flex-grow">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-5 bg-muted rounded w-4/5" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="pt-4 flex gap-2">
                    <div className="h-8 bg-muted rounded flex-1" />
                    <div className="h-8 bg-muted rounded flex-1" />
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
            <h2 className="text-xl font-playfair font-bold text-foreground mb-2">Could Not Load Pieces</h2>
            <p className="text-muted-foreground text-sm mb-6">{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline" size="sm">
              Try Again
            </Button>
          </div>
        )}

        {/* Product Grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {allProducts.map((product) => (
              <Card
                key={product._id}
                className="group flex flex-col bg-card border border-border/70 hover:border-primary/40 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300"
              >
                {/* Product Image & Overlays */}
                <div className="relative">
                  <ProductImage src={getProductImage(product)} alt={product.name} />

                  {/* Badge */}
                  {product.badge && (
                    <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full shadow-sm z-10">
                      {product.badge}
                    </span>
                  )}

                  {/* Wishlist Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWishlist(product._id);
                    }}
                    aria-label={wishlistIds.has(product._id) ? "Remove from wishlist" : "Add to wishlist"}
                    className="absolute top-3 right-3 p-2 rounded-full bg-white/90 dark:bg-[#1A1413]/90 hover:bg-white dark:hover:bg-[#241C1A] text-foreground shadow-sm hover:shadow-md transition-all duration-200 z-10 group/btn"
                    title={wishlistIds.has(product._id) ? "Remove from wishlist" : "Add to wishlist"}
                  >
                    <Heart
                      className={`h-4 w-4 transition-colors ${
                        wishlistIds.has(product._id)
                          ? "fill-primary text-primary"
                          : "text-muted-foreground group-hover/btn:text-primary"
                      }`}
                    />
                  </button>
                </div>

                {/* Product Details */}
                <CardContent className="p-4 flex-grow flex flex-col justify-between">
                  <div>
                    {/* Category */}
                    <span className="text-[11px] font-medium tracking-wider uppercase text-muted-foreground block mb-1">
                      {getCategoryName(product)}
                    </span>

                    {/* Title */}
                    <h2
                      onClick={() => navigate(`/product/${product._id}`)}
                      className="font-playfair font-semibold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors cursor-pointer line-clamp-1 mb-2"
                      title={product.name}
                    >
                      {product.name}
                    </h2>

                    {/* Price */}
                    <div className="mb-2">
                      {product.salePrice && product.salePrice < product.price ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-base sm:text-lg font-bold text-primary font-serif">
                            ₹{product.salePrice.toLocaleString("en-IN")}
                          </span>
                          <span className="text-xs text-muted-foreground line-through">
                            ₹{product.price.toLocaleString("en-IN")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-base sm:text-lg font-bold text-foreground font-serif">
                          ₹{product.price.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>

                    {!product.isInStock && (
                      <span className="text-[11px] text-destructive font-medium block mb-2">
                        Out of Stock
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border/60">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/product/${product._id}`)}
                      className="w-full text-xs font-medium border-border hover:border-primary/50 hover:bg-secondary transition-colors"
                    >
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        addToCart(
                          product._id,
                          product.name,
                          product.effectivePrice,
                          getProductImage(product)
                        )
                      }
                      disabled={!product.isInStock}
                      className="w-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      {product.isInStock ? "Add to Cart" : "Sold Out"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && allProducts.length === 0 && (
          <div className="text-center py-20 bg-card border border-border rounded-2xl max-w-lg mx-auto p-8 shadow-sm">
            <Gem className="h-12 w-12 text-primary/40 mx-auto mb-3" />
            <h2 className="text-xl font-playfair font-bold text-foreground mb-2">No Pieces Found</h2>
            <p className="text-muted-foreground text-sm mb-6">
              We couldn't find any jewellery pieces matching your filter. Try clearing filters or searching for something else.
            </p>
            <Button onClick={handleResetFilters} variant="outline" size="sm" className="border-border">
              View All Collections
            </Button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}