import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Instagram } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-secondary border-t border-border py-8">
      <motion.div
        className="max-w-6xl mx-auto px-6 text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="text-2xl font-playfair font-bold text-foreground mb-4" data-testid="footer-logo">
          <span className="text-foreground">Renu's</span>
          <span className="text-primary"> Collections</span>
        </div>
        <p className="text-muted-foreground mb-3" data-testid="footer-tagline">
          Refined Adornment. Uncompromising Elegance.
        </p>

        {/* Instagram Social Connect */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <a
            href="https://www.instagram.com/renus_collections05/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/25 bg-primary/5 hover:bg-primary/15 text-primary transition-all text-xs font-medium"
            title="Follow Renu's Collections on Instagram"
          >
            <Instagram className="w-4 h-4 text-primary" />
            <span>@renus_collections05</span>
            <span className="text-muted-foreground hidden sm:inline">• Follow us on Instagram for custom enquiries & designs</span>
          </a>
        </div>

        <div className="flex flex-wrap justify-center gap-4 mb-4 text-sm">
          <Link to="/" className="text-primary hover:underline">Home</Link>
          <Link to="/about" className="text-primary hover:underline">About</Link>
          <Link to="/products" className="text-primary hover:underline">Products</Link>
          <Link to="/contact" className="text-primary hover:underline">Contact</Link>
          <Link to="/cart" className="text-primary hover:underline">Cart</Link>
          <Link to="/wishlist" className="text-primary hover:underline">Wishlist</Link>
          <Link to="/login" className="text-primary hover:underline">Login</Link>
          <Link to="/register" className="text-primary hover:underline">Register</Link>
          <Link to="/admin" className="text-primary hover:underline">Admin</Link>
        </div>
        <p className="text-muted-foreground/80 text-sm" data-testid="footer-copyright">
          © 2026 Renu's Collections. All rights reserved.
        </p>
      </motion.div>
    </footer>
  );
}
