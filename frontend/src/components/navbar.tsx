import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setIsMobileMenuOpen(false);
    }
  };

  const baseNavItems = [
    { label: "Home", path: "/" },
    { label: "Products", path: "/products" },
    { label: "Wishlist", path: "/wishlist" },
    { label: "About", path: "/about" },
    { label: "Contact", path: "/contact" },
    { label: "Cart", path: "/cart" },
  ] as const;

  const authNavItems = user
    ? [{ label: `Welcome, ${user.username}`, path: "#" }, { label: "Logout", onClick: logout, path: "#" }]
    : [{ label: "Login", path: "/login" }, { label: "Register", path: "/register" }];

  const navItems = [...baseNavItems, ...authNavItems];

  const isHomePage = location.pathname === "/";
  const navbarBgClass =
    theme === "light" && !isHomePage ? "bg-[hsla(330,100%,50%,0.35)]" : "";

  return (
    <>
      <motion.nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 py-4 ${
          isScrolled ? "navbar-blur" : ""
        } ${navbarBgClass}`}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
        data-testid="navbar"
      >
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo */}
          <motion.div
            className="text-2xl font-playfair font-bold cursor-pointer"
            onClick={() => scrollToSection("home")}
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            data-testid="logo"
          >
            <span className="text-primary">Renu's</span>
            <span className="text-primary"> Collections</span>
          </motion.div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-8">
            {navItems.map((item) => (
              ("onClick" in item) ? (
                <Button
                  key={item.label}
                  onClick={item.onClick}
                  variant="ghost"
                  className="text-sm font-medium text-cream hover:text-primary transition-colors relative group"
                >
                  {item.label}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </Button>
              ) : ("href" in item) ? (
                <a
                  key={item.label}
                  href={item.href as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-cream hover:text-primary transition-colors relative group"
                >
                  {item.label}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </a>
              ) : (
                <Link
                  key={item.path}
                  to={item.path}
                  className="text-sm font-medium text-cream hover:text-primary transition-colors relative group"
                  data-testid={`nav-link-${item.label.toLowerCase()}`}
                >
                  {item.label}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </Link>
              )
            ))}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary"
              onClick={toggleTheme}
              data-testid="theme-toggle-btn"
            >
              <Sun className="h-6 w-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-6 w-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-primary"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              data-testid="mobile-menu-btn"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-primary md:hidden"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            data-testid="mobile-menu"
          >
            <div className="flex flex-col justify-center items-center h-full space-y-8">
              {navItems.map((item, index) => (
                ("onClick" in item) ? (
                  <motion.button
                    key={item.label}
                    onClick={() => { item.onClick(); setIsMobileMenuOpen(false); }}
                    className="text-white text-2xl font-playfair bg-transparent border-none cursor-pointer"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {item.label}
                  </motion.button>
                ) : (
                  <motion.a
                    key={item.label}
                    href={("href" in item) ? item.href as string : item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-white text-2xl font-playfair"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    data-testid={`mobile-nav-link-${item.label.toLowerCase()}`}
                  >
                    {item.label}
                  </motion.a>
                )
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
