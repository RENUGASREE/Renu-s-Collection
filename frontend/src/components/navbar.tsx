import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
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
    }
  };

  const baseNavItems = [
    { label: "Home", path: "/" },
    { label: "Products", path: "/products" },
    { label: "Wishlist", path: "/wishlist" },
    { label: "Orders", path: "/orders" },
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

          {/* Theme Toggle */}
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
          </div>
        </div>
      </motion.nav>
    </>
  );
}
