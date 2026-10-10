import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sun, Moon, Menu, ShoppingBag, Heart, Package, User, LogOut, LogIn, UserPlus, Info, Phone, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isHomePage = location.pathname === "/";
  // Hero state: only on home page when unscrolled
  const isHeroState = isHomePage && !isScrolled;

  const handleLogoClick = () => {
    if (isHomePage) {
      const element = document.getElementById("home");
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      navigate("/");
    }
  };

  const baseNavItems = [
    { label: "Home", path: "/", icon: Home },
    { label: "Products", path: "/products", icon: ShoppingBag },
    { label: "Wishlist", path: "/wishlist", icon: Heart },
    { label: "Orders", path: "/orders", icon: Package },
    { label: "About", path: "/about", icon: Info },
    { label: "Contact", path: "/contact", icon: Phone },
    { label: "Cart", path: "/cart", icon: ShoppingBag },
  ] as const;

  const authNavItems = user
    ? [
        { label: `Account (${user.username})`, path: "/account", icon: User },
        { label: "Logout", onClick: logout, path: "#", icon: LogOut },
      ]
    : [
        { label: "Login", path: "/login", icon: LogIn },
        { label: "Register", path: "/register", icon: UserPlus },
      ];

  const navItems = [...baseNavItems, ...authNavItems];

  // Dynamic styling: Subtle translucent wash over light hero, Warm Ivory with blur when scrolled or on standard pages
  const navContainerClass = isHeroState
    ? "bg-background/25 backdrop-blur-[2px] border-b border-border/20 shadow-none"
    : "bg-background/95 backdrop-blur-md border-b border-border shadow-sm";

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 sm:px-6 py-3.5 ${navContainerClass}`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      data-testid="navbar"
    >
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Brand Logo */}
        <motion.div
          className="text-2xl font-playfair font-bold cursor-pointer select-none tracking-tight"
          onClick={handleLogoClick}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          data-testid="logo"
        >
          <span className="text-primary font-bold">Renu's</span>
          <span className="text-foreground font-bold"> Collections</span>
        </motion.div>

        {/* Desktop Navigation (Visible on lg screens: >= 1024px) */}
        <div className="hidden lg:flex items-center space-x-6 xl:space-x-7">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;

            if ("onClick" in item) {
              return (
                <Button
                  key={item.label}
                  onClick={item.onClick}
                  variant="ghost"
                  size="sm"
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors relative group px-2 py-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {item.label}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </Button>
              );
            }

            if ("href" in item) {
              return (
                <a
                  key={item.label}
                  href={item.href as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors relative group py-1 px-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {item.label}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </a>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium text-foreground hover:text-primary transition-colors relative group py-1 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm ${
                  isActive ? "text-primary font-semibold" : ""
                }`}
                data-testid={`nav-link-${item.label.toLowerCase()}`}
              >
                {item.label}
                <span
                  className={`absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-300 ${
                    isActive ? "w-full" : "w-0 group-hover:w-full"
                  }`}
                ></span>
              </Link>
            );
          })}
        </div>

        {/* Quick Actions: Theme Toggle & Responsive Drawer (< 1024px) */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="transition-colors rounded-full text-foreground hover:text-primary hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            onClick={toggleTheme}
            aria-label="Toggle light or dark theme"
            data-testid="theme-toggle-btn"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          {/* Compact Tablet/Mobile Navigation Trigger (< 1024px) */}
          <div className="lg:hidden">
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-foreground hover:text-primary hover:bg-secondary rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label="Open navigation menu"
                  data-testid="mobile-menu-trigger"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-background border-l border-border w-[300px] sm:w-[340px] p-6 flex flex-col justify-between">
                <div>
                  <SheetHeader className="text-left mb-6 pb-4 border-b border-border">
                    <SheetTitle className="text-2xl font-playfair font-bold">
                      <span className="text-primary font-bold">Renu's</span>
                      <span className="text-foreground font-bold"> Collections</span>
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground font-light">
                      Refined Adornment. Uncompromising Elegance.
                    </p>
                  </SheetHeader>

                  {/* Navigation Links */}
                  <div className="space-y-1.5">
                    {baseNavItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-secondary text-primary font-semibold"
                              : "text-foreground hover:text-primary hover:bg-secondary/60"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>

                  {/* Account / Authentication Section */}
                  <div className="mt-6 pt-4 border-t border-border space-y-1.5">
                    {authNavItems.map((item) => {
                      const Icon = item.icon;
                      if ("onClick" in item) {
                        return (
                          <button
                            key={item.label}
                            onClick={() => {
                              setIsMenuOpen(false);
                              item.onClick();
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </button>
                        );
                      }
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-secondary text-primary font-semibold"
                              : "text-foreground hover:text-primary hover:bg-secondary/60"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-border text-center text-xs text-muted-foreground">
                  © 2026 Renu's Collections
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
