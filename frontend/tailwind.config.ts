import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}", "./src/index.css"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        // Approved Boutique Brand Colors
        "warm-ivory": "hsl(var(--warm-ivory) / <alpha-value>)",
        "pearl-white": "hsl(var(--pearl-white) / <alpha-value>)",
        "blush-cream": "hsl(var(--blush-cream) / <alpha-value>)",
        "antique-rose": "hsl(var(--antique-rose) / <alpha-value>)",
        "deep-rose": "hsl(var(--deep-rose) / <alpha-value>)",
        "champagne-gold": "hsl(var(--champagne-gold) / <alpha-value>)",
        "espresso": "hsl(var(--espresso) / <alpha-value>)",
        "warm-taupe": "hsl(var(--warm-taupe) / <alpha-value>)",
        "soft-sand": "hsl(var(--soft-sand) / <alpha-value>)",

        // Legacy brand aliases
        "rose-gold": "hsl(var(--rose-gold) / <alpha-value>)",
        "matte-black": "hsl(var(--matte-black) / <alpha-value>)",
        "cream": "hsl(var(--cream) / <alpha-value>)",
        "rose-glow": "hsl(var(--rose-glow) / <alpha-value>)",
        "renu-color": "hsl(var(--renu-color) / <alpha-value>)",
        "collections-color": "hsl(var(--collections-color) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
        playfair: ["var(--font-playfair)"],
        inter: ["var(--font-inter)"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        fadeInUp: {
          "0%": {
            opacity: "0",
            transform: "translateY(30px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        pulseGlow: {
          "0%, 100%": {
            boxShadow: "0 0 5px hsl(357 33% 57% / 0.4)",
          },
          "50%": {
            boxShadow: "0 0 20px hsl(357 33% 57% / 0.7), 0 0 30px hsl(357 33% 57% / 0.3)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fadeInUp 1.2s ease-out",
        "fade-in-up-delay": "fadeInUp 1.2s ease-out 0.3s both",
        "fade-in-up-delay-long": "fadeInUp 1.2s ease-out 0.6s both",
        "pulse-glow": "pulseGlow 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;