import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL, getAssetUrl } from "@/lib/queryClient";

// Define slideshow images
const slideshowImages = [
  "/assets/hero-banner-1.png",
  "/assets/hero-banner-2.png"
];

export default function HeroSection() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [nextImageIndex, setNextImageIndex] = useState(1);
  const [isFading, setIsFading] = useState(false);

  // Preload images
  useEffect(() => {
    slideshowImages.forEach(image => {
      const img = new Image();
      img.src = image;
    });
  }, []);

  // Handle slideshow transitions
  useEffect(() => {
    if (slideshowImages.length === 0) return;

    const interval = setInterval(() => {
      setIsFading(true);

      setTimeout(() => {
        setCurrentImageIndex(prevIndex => (prevIndex + 1) % slideshowImages.length);
        setNextImageIndex(prevIndex => (prevIndex + 2) % slideshowImages.length);
        setIsFading(false);
      }, 1000);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const scrollToCollection = () => {
    const element = document.getElementById("collection");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (slideshowImages.length === 0) return null;

  return (
    <section id="home" className="min-h-screen hero-bg flex items-center justify-center relative overflow-hidden">
      {/* Hero Background Images - Current */}
      <motion.div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        initial={{ opacity: 1 }}
        animate={{
          opacity: isFading ? 0 : 1,
          transition: { duration: 1 }
        }}
        style={{
          backgroundImage: `url('${slideshowImages[currentImageIndex]}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Hero Background Images - Next (preloaded) */}
      <motion.div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        initial={{ opacity: 0 }}
        animate={{
          opacity: isFading ? 1 : 0,
          transition: { duration: 1 }
        }}
        style={{
          backgroundImage: `url('${slideshowImages[nextImageIndex]}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
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
