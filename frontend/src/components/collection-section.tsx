import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gem, Heart, Star, Leaf, Moon, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { API_BASE_URL, getAssetUrl } from "@/lib/queryClient";
import { useNavigate } from "react-router-dom";

interface BraceletCard {
  id: string | number;
  name: string;
  description: string;
  price: number;
  media: { url: string; isPrimary: boolean }[];
  category: string;
  icon: string;
  badge: string;
  is_signature_piece: boolean;
  isSignaturePiece?: boolean;
  signature_category: string;
  signatureCategory?: string;
}

const iconMap: { [key: string]: typeof Gem } = {
  Gem: Gem,
  Heart: Heart,
  Star: Star,
  Leaf: Leaf,
  Moon: Moon,
};

const formatCategoryName = (category: string) => {
  if (category === "all") return "All";
  if (category === "signature_trending") return "Trending";
  if (category === "signature_fashion") return "Fashion";
  if (category === "signature_latest") return "Latest";
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function CollectionSection() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [bracelets, setBracelets] = useState<BraceletCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dynamicFilters, setDynamicFilters] = useState<string[]>(["all"]);
  const navigate = useNavigate();

  const fetchSignaturePieces = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch signature pieces using the new API endpoint
      const response = await axios.get<any>(`${API_BASE_URL}/api/v1/products`, {
        params: { isSignaturePiece: true, isActive: true },
      });

      // Map the data
      let products =
        response.data.data?.map((item: any) => ({
          ...item,
          id: item._id,
          product_type: "product",
          isSignaturePiece: Boolean(item.isSignaturePiece ?? item.is_signature_piece),
          signatureCategory: item.signatureCategory || item.signature_category || "none",
        })) || [];

      // If no signature pieces, fetch regular products as fallback
      if (products.length === 0) {
        const regularResponse = await axios.get<any>(`${API_BASE_URL}/api/v1/products`, {
          params: { isActive: true, limit: 6 },
        });
        products =
          regularResponse.data.data?.map((item: any) => ({
            ...item,
            id: item._id,
            product_type: "product",
            isSignaturePiece: false,
            signatureCategory: "none",
          })) || [];
      }

      setBracelets(products);

      // Extract unique signature categories from products
      const signatureCategories = new Set<string>();
      products.forEach((p: any) => {
        const sigCat = p.signatureCategory || p.signature_category;
        if (sigCat && sigCat !== "none") {
          signatureCategories.add(sigCat);
        }
      });

      // Build dynamic filters - only show "all" and actual signature categories
      const filters = ["all"];
      signatureCategories.forEach((cat) => {
        filters.push(`signature_${cat}`);
      });
      setDynamicFilters(filters);
    } catch (err) {
      setError("Unable to connect to signature collection service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignaturePieces();
  }, []);

  const filteredBracelets = bracelets.filter((bracelet) => {
    if (activeFilter === "all") return true; // Show all products when no signature pieces exist
    const sigCat = bracelet.signatureCategory || bracelet.signature_category || "";
    const isSig = Boolean(bracelet.isSignaturePiece ?? bracelet.is_signature_piece);
    if (activeFilter === "signature_none") {
      return isSig === true && (!sigCat || sigCat === "none");
    }
    const filterValue = activeFilter.replace("signature_", "");
    return isSig === true && sigCat === filterValue;
  });

  const getImageUrl = (bracelet: BraceletCard) => {
    const primaryMedia = bracelet.media?.find((m) => m.isPrimary);
    const imageUrl = primaryMedia?.url || bracelet.media?.[0]?.url;
    return imageUrl ? getAssetUrl(imageUrl) : "";
  };

  return (
    <section id="collection" className="py-20 bg-secondary">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2
            className="text-4xl md:text-5xl font-playfair font-bold text-foreground mb-4"
            data-testid="collection-title"
          >
            Our Signature Pieces
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Explore our exclusive collection of signature pieces, showcasing our most popular and highly-rated designs.
          </p>
        </motion.div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-card border border-border rounded-xl overflow-hidden animate-pulse"
              >
                <div className="w-full h-64 bg-muted/60" />
                <div className="p-6 space-y-3">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-5 bg-muted rounded w-1/4 pt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Soft Boutique Error State */}
        {error && !loading && (
          <div className="max-w-md mx-auto text-center p-8 bg-card border border-border rounded-2xl shadow-sm space-y-4">
            <Sparkles className="h-10 w-10 text-primary/60 mx-auto" />
            <h3 className="font-playfair font-semibold text-lg text-foreground">
              Signature Collection Currently Unavailable
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              We are currently unable to reach the jewellery database. Please verify your connection or try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSignaturePieces}
              className="border-border text-xs hover:bg-secondary hover:border-primary/40 font-medium"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Retry Connection
            </Button>
          </div>
        )}

        {/* Success State: Filter Buttons & Grid */}
        {!loading && !error && (
          <>
            {/* Filter Buttons */}
            <motion.div
              className="flex flex-wrap justify-center gap-4 mb-12"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {dynamicFilters.map((filter) => (
                <Button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  variant={activeFilter === filter ? "default" : "outline"}
                  className={`px-6 py-2 border border-primary transition-all glow-hover ${
                    activeFilter === filter
                      ? "bg-primary text-white"
                      : "text-primary hover:bg-primary hover:text-white"
                  }`}
                  data-testid={`filter-${filter}`}
                >
                  {formatCategoryName(filter)}
                </Button>
              ))}
            </motion.div>

            {/* Bracelet Grid */}
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
              layout
            >
              {filteredBracelets.map((bracelet, index) => (
                <motion.div
                  key={bracelet.id}
                  className="card-hover bg-card rounded-lg overflow-hidden relative group cursor-pointer"
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  layout
                  data-testid={`bracelet-card-${bracelet.id}`}
                  onClick={() => navigate(`/product/${bracelet.id}`)}
                >
                  <div className="relative overflow-hidden">
                    <img
                      src={getImageUrl(bracelet)}
                      alt={bracelet.name}
                      className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-110"
                      data-testid={`bracelet-image-${bracelet.id}`}
                    />
                    {bracelet.badge && (
                      <div className="absolute top-4 right-4 bg-primary text-white px-3 py-1 rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        {bracelet.badge}
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <h3
                      className="text-xl font-playfair font-bold text-card-foreground mb-2 cursor-pointer hover:text-primary transition-colors"
                      data-testid={`bracelet-name-${bracelet.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/product/${bracelet.id}`);
                      }}
                    >
                      {bracelet.name}
                    </h3>
                    <p
                      className="text-card-foreground/70 mb-4 cursor-pointer"
                      data-testid={`bracelet-description-${bracelet.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/product/${bracelet.id}`);
                      }}
                    >
                      {bracelet.description}
                    </p>
                    <div className="flex justify-between items-center">
                      <span
                        className="text-primary font-bold text-lg cursor-pointer"
                        data-testid={`bracelet-price-${bracelet.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/product/${bracelet.id}`);
                        }}
                      >
                        <p className="text-lg font-semibold mt-2">₹{bracelet.price}</p>
                      </span>
                      <motion.div
                        className="rotate-charm cursor-pointer"
                        whileHover={{ rotate: 360 }}
                        transition={{ duration: 0.6 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/product/${bracelet.id}`);
                        }}
                      >
                        {iconMap[bracelet.icon] &&
                          React.createElement(iconMap[bracelet.icon], {
                            className: "h-6 w-6 text-primary",
                          })}
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </>
        )}
      </div>
    </section>
  );
}
