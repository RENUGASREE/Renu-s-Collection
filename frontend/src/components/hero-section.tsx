import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL, getAssetUrl } from "@/lib/queryClient";

// Define slideshow images
const slideshowImages = [
  "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2340&h=1560",
  "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&h=1560",
  "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&h=1560",
  "https://images.unsplash.com/photo-1617038220319-276d3cfab638?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&h=1560",
  "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&h=1560"
];

export default function HeroSection() {
  const [productImages, setProductImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [nextImageIndex, setNextImageIndex] = useState(1);
  const [isFading, setIsFading] = useState(false); // New state to control fade

  useEffect(() => {
    // Always use slideshow images for GitHub Pages deployment
    // This ensures the hero section works without any API dependencies
    console.log('Using fallback slideshow images for hero section');
    setProductImages(slideshowImages);
    
    // Optional: In development, you can try to fetch real images
    if (window.location.hostname === 'localhost') {
      const fetchProductImages = async () => {
        try {
          const response = await axios.get(`${API_BASE_URL}/api/bracelets/`);
          const braceletsRes = response.data as any[];
          const images = braceletsRes.map((p: any) => getAssetUrl(p.imageUrl)).filter(Boolean);
          
          if (images.length > 0) {
            setProductImages(images);
          }
        } catch (error) {
          console.log('API not available, using fallback images');
          // Keep the slideshow images as fallback
        }
      };
      
      // Only try API in development
      fetchProductImages();
    }
  }, []);

  // Preload images
  useEffect(() => {
    const imagesToUse = productImages.length > 0 ? productImages : slideshowImages;
    imagesToUse.forEach(image => {
      const img = new Image();
      img.src = image;
    });
  }, [productImages, slideshowImages]);

  // Handle slideshow transitions
  useEffect(() => {
    const imagesToUse = productImages.length > 0 ? productImages : slideshowImages;
    if (imagesToUse.length === 0) return;

    const interval = setInterval(() => {
      setIsFading(true); // Start fade out of current, fade in of next

      setTimeout(() => {
        setCurrentImageIndex(prevIndex => (prevIndex + 1) % imagesToUse.length);
        setNextImageIndex(prevIndex => (prevIndex + 2) % imagesToUse.length); // Update next image index
        setIsFading(false); // Reset fade state after indices are updated
      }, 1000); // Duration of the fade transition
    }, 3000); // Total cycle: 2s display + 1s transition

    return () => clearInterval(interval);
  }, [productImages, slideshowImages]); // Removed incomingImageIndex from dependency array

  const scrollToCollection = () => {
    const element = document.getElementById("collection");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const imagesToDisplay = productImages.length > 0 ? productImages : slideshowImages;
  if (imagesToDisplay.length === 0) return null; // Render nothing if no images are available

  return (
    <section id="home" className="min-h-screen hero-bg flex items-center justify-center relative overflow-hidden">
      {/* Hero Background Images - Current */}
      <motion.div 
        className="absolute inset-0 bg-cover bg-center"
        initial={{ opacity: 1 }}
        animate={{
          opacity: isFading ? 0 : 1, // Fade out current image
          transition: { duration: 1 }
        }}
        style={{
          backgroundImage: `url('${imagesToDisplay[currentImageIndex]}')`
        }}
      />

      {/* Hero Background Images - Next (preloaded) */}
      <motion.div 
        className="absolute inset-0 bg-cover bg-center"
        initial={{ opacity: 0 }}
        animate={{
          opacity: isFading ? 1 : 0, // Fade in next image
          transition: { duration: 1 }
        }}
        style={{
          backgroundImage: `url('${imagesToDisplay[nextImageIndex]}')`
        }}
      />
      
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Logo */}
        <motion.h1
          className="text-6xl md:text-8xl font-playfair font-bold mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          data-testid="hero-logo"
        >
          <span className="text-primary" style={{ textShadow: '0 0 1px var(--heading-outline-color)' }}>Renu's</span>
          <br />
          <span className="text-primary" style={{ textShadow: '0 0 1px var(--heading-primary-shadow)' }}>Collections</span>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          className="text-xl md:text-2xl text-cream mb-8 font-light tracking-wide"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          data-testid="hero-tagline"
        >
          Refined Adornment.
          <br />
          Uncompromising Elegance.
        </motion.p>

        {/* CTA Button */}
        <motion.div
          className="text-center mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.6 }}
        >
          <Button
            onClick={scrollToCollection}
            className="glow-hover px-8 py-4 border-2 border-primary bg-transparent text-primary font-medium tracking-wider hover:bg-primary hover:text-white transition-all duration-300"
            data-testid="hero-cta-button"
          >
            SHOP THE COLLECTION
          </Button>

          {/* Scroll Indicator */}
          <motion.div
            className="mt-8 text-primary cursor-pointer flex justify-center"
            onClick={scrollToCollection}
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            data-testid="scroll-indicator"
          >
            <ChevronDown className="h-8 w-8" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
