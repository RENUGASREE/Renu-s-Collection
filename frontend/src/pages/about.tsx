import AboutSection from "@/components/about-section";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";

export default function About() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title="About Us - Renu's Collections"
        description="Learn about Renu's Collections, your destination for luxury customized jewelry. Discover our story, craftsmanship, and commitment to quality."
        keywords="about renu's collections, luxury jewelry story, custom jewelry craftsmanship, jewelry brand history"
        url="https://renucollections.com/about"
      />
      <main className="container mx-auto px-4 py-8">
      <AboutSection />
      </main>
      <Footer />
    </div>
  );
}