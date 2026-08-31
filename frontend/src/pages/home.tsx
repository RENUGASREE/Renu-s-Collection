import HeroSection from "@/components/hero-section";
import CollectionSection from "@/components/collection-section";
import AboutSection from "@/components/about-section";
import Footer from "@/components/footer";
import { ScrollReveal } from "@/components/visual-effects";
import { SEO } from "@/components/SEO";

export default function Home() {
  return (
    <>
      <SEO 
        title="Renu's Collections - Luxury Customized Jewelry"
        description="Discover exquisite luxury bracelets and chains at Renu's Collections. Shop online for custom, gemstone, and handmade jewelry designs. Your premier jewelry brand in India."
        keywords="womens bracelets, chains, custom jewelry, luxury bracelets, gemstone jewelry, handmade jewelry, Renu's Collections, jewelry brand India, online jewelry store, customized jewelry"
        type="website"
      />
      <div className="min-h-screen bg-background">
      <HeroSection />
      
      <ScrollReveal>
        <CollectionSection />
      </ScrollReveal>
      
      <ScrollReveal delay={0.2}>
        <AboutSection />
      </ScrollReveal>
      
      <ScrollReveal direction="up" delay={0.3}>
        <Footer />
      </ScrollReveal>
      </div>
    </>
  );
}
