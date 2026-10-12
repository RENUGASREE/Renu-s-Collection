import React from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Package, 
  Layers, 
  Boxes, 
  ShoppingBag, 
  Sliders, 
  Star, 
  ChevronRight,
  ExternalLink
} from "lucide-react";

interface AdminNavProps {
  currentPath?: string;
  className?: string;
}

export const AdminNav: React.FC<AdminNavProps> = ({ currentPath, className = "" }) => {
  const location = useLocation();
  const active = currentPath || location.pathname;

  const links = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/products", label: "Products", icon: Package },
    { href: "/admin/categories", label: "Categories", icon: Layers },
    { href: "/admin/inventory", label: "Inventory", icon: Boxes },
    { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
    { href: "/admin/customization", label: "Customization", icon: Sliders },
    { href: "/admin/reviews", label: "Reviews", icon: Star },
  ];

  const isCurrent = (href: string, exact?: boolean) => {
    if (exact) {
      return active === href || active === `${href}/`;
    }
    return active.startsWith(href);
  };

  return (
    <nav className={`flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none ${className}`}>
      {links.map((link) => {
        const Icon = link.icon;
        const activeItem = isCurrent(link.href, link.exact);

        return (
          <Link
            key={link.href}
            to={link.href}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all border shrink-0 ${
              activeItem
                ? "bg-[#B66F72] text-white border-[#B66F72] shadow-xs"
                : "bg-white/80 dark:bg-card/80 text-[#756861] dark:text-muted-foreground border-[#E6D8D0] dark:border-border hover:bg-[#F1E6DF]/50 dark:hover:bg-muted"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{link.label}</span>
          </Link>
        );
      })}
      <Link
        to="/"
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#756861] dark:text-muted-foreground hover:text-[#B66F72] dark:hover:text-primary transition-colors shrink-0"
      >
        <span>View Store</span>
        <ExternalLink className="w-3.5 h-3.5" />
      </Link>
    </nav>
  );
};

export default AdminNav;
