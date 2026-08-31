import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'product' | 'article';
  siteName?: string;
  locale?: string;
  noindex?: boolean;
  canonicalUrl?: string;
}

export const SEO: React.FC<SEOProps> = ({
  title = "Renu's Collections - Luxury Customized Jewelry",
  description = 'Discover exquisite luxury bracelets and chains at Renu\'s Collections. Shop online for custom, gemstone, and handmade jewelry designs. Your premier jewelry brand in India.',
  keywords = 'womens bracelets, chains, custom jewelry, luxury bracelets, gemstone jewelry, handmade jewelry, Renu\'s Collections, jewelry brand India, online jewelry store',
  image = '/logo.png',
  url = typeof window !== 'undefined' ? window.location.href : '',
  type = 'website',
  siteName = "Renu's Collections",
  locale = 'en_IN',
  noindex = false,
  canonicalUrl
}) => {
  const fullTitle = title.includes("Renu's Collections") ? title : `${title} | Renu's Collections`;
  
  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="robots" content={noindex ? 'noindex,nofollow' : 'index,follow'} />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      
      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      
      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content={locale} />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content="@renucollections" />
      
      {/* Additional SEO Meta Tags */}
      <meta name="author" content="Renu's Collections" />
      <meta name="publisher" content="Renu's Collections" />
      <meta name="theme-color" content="#000000" />
      <meta name="msapplication-TileColor" content="#000000" />
      
      {/* Structured Data for E-commerce */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "Renu's Collections",
          "url": "https://renucollections.com",
          "potentialAction": {
            "@type": "SearchAction",
            "target": "https://renucollections.com/search?q={search_term_string}",
            "query-input": "required name=search_term_string"
          }
        })}
      </script>
      
      {/* Local Business Schema */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Renu's Collections",
          "description": "Luxury customized jewelry store specializing in bracelets and chains",
          "url": "https://renucollections.com",
          "telephone": "+91-XXXXXXXXXX",
          "address": {
            "@type": "PostalAddress",
            "addressCountry": "IN",
            "addressRegion": "India"
          },
          "priceRange": "₹₹₹",
          "paymentAccepted": "Cash, Credit Card, UPI, Razorpay",
          "currenciesAccepted": "INR"
        })}
      </script>
    </Helmet>
  );
};