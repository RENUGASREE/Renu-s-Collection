import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-secondary border-t border-primary/20 py-8">
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
        <p className="text-background/70 mb-4" data-testid="footer-tagline">
          Refined Adornment. Uncompromising Elegance.
        </p>
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
        <p className="text-background/50 text-sm" data-testid="footer-copyright">
          © 2024 Renu's Collections. All rights reserved.
        </p>
      </motion.div>
    </footer>
  );
}
