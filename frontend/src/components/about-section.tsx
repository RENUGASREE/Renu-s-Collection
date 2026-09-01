import { Gem, Hand, Infinity as InfinityIcon } from "lucide-react";
import { motion } from "framer-motion";
import { getAssetUrl } from "@/lib/queryClient";

export default function AboutSection() {
  const originsImage: string | null = getAssetUrl("/placeholders/placeholder.png");
  const craftsmanshipImage: string | null = getAssetUrl("/placeholders/placeholder.png");

  const philosophyItems = [
    {
      icon: Gem,
      title: "Quality",
      description: "Premium materials sourced ethically from around the world"
    },
    {
      icon: Hand,
      title: "Craftsmanship",
      description: "Handcrafted by skilled artisans with attention to detail"
    },
    {
      icon: InfinityIcon,
      title: "Timeless",
      description: "Designs that transcend trends and celebrate individuality"
    }
  ];

  return (
    <section id="about" className="py-20 bg-background relative overflow-hidden">
      {/* Parallax background */}
      <div 
        className="absolute inset-0 parallax-bg opacity-10"
        style={{
          backgroundImage: originsImage ? `url('${originsImage}')` : "none"
        }}
      />
      
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Section Header */}
        <motion.div
          className="text-center mb-20"
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-playfair font-bold text-foreground mb-4" data-testid="about-title">
            The Story Behind Renu's Collections
          </h2>
          <div className="w-20 h-1 bg-primary mx-auto"></div>
        </motion.div>

        {/* Timeline Content */}
        <div className="space-y-20">
          {/* Origins */}
          <motion.div
            className="flex flex-col lg:flex-row items-center gap-12"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="lg:w-1/2">
              <h3 className="text-3xl font-playfair font-bold text-foreground mb-6" data-testid="origins-title">
                Our Origins
              </h3>
              <p className="text-lg text-foreground leading-relaxed mb-6">
                Born from a vision of elegance and simplicity, Renu's Collections emerged from the desire to create jewelry that transcends trends and speaks to the soul. Our journey began with a single belief: that true luxury lies not in excess, but in the perfect harmony of design and craftsmanship.
              </p>
              <p className="text-lg text-foreground leading-relaxed">
                What started as a passionate pursuit of creating beautiful, meaningful jewelry has evolved into a brand synonymous with refined taste and uncompromising quality, offering a curated collection of bracelets, earrings, bangles, and accessories.
              </p>
            </div>
            <motion.div
              className="lg:w-1/2"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <img
                src={originsImage || "/placeholders/placeholder.png"}
                alt="Artisan crafting jewelry"
                className="rounded-lg shadow-2xl w-full"
                data-testid="origins-image"
              />
            </motion.div>
          </motion.div>

          {/* Craftsmanship */}
          <motion.div
            className="flex flex-col lg:flex-row-reverse items-center gap-12"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="lg:w-1/2">
              <h3 className="text-3xl font-playfair font-bold text-foreground mb-6" data-testid="craftsmanship-title">
                Handcrafted Excellence
              </h3>
              <p className="text-lg text-foreground leading-relaxed mb-6">
                Each piece is handcrafted with precision by skilled artisans who bring dedication and care to every creation. We believe that the human touch cannot be replicated by machines—it's what gives our jewelry its soul and character.
              </p>
              <p className="text-lg text-foreground leading-relaxed">
                From selecting the finest materials to the final polish, every step of our process is carefully monitored to ensure that each piece meets our exacting standards of excellence.
              </p>
            </div>
            <motion.div
              className="lg:w-1/2"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <img
                src={craftsmanshipImage || "/placeholders/placeholder.png"}
                alt="Jewelry crafting tools and process"
                className="rounded-lg shadow-2xl w-full"
                data-testid="craftsmanship-image"
              />
            </motion.div>
          </motion.div>

          {/* Philosophy */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h3 className="text-3xl font-playfair font-bold text-foreground mb-6" data-testid="philosophy-title">
              Philosophy of Luxury
            </h3>
            <div className="max-w-4xl mx-auto">
              <p className="text-xl text-foreground leading-relaxed mb-8">
                We believe that true luxury is in the details—quality, not quantity. It's about creating pieces that become part of your story, that age gracefully with you, and that carry meaning beyond their material value.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                {philosophyItems.map((item, index) => (
                  <motion.div
                    key={item.title}
                    className="text-center"
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: index * 0.2 }}
                    data-testid={`philosophy-item-${item.title.toLowerCase()}`}
                  >
                    <motion.div
                      className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 glow-hover"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      <item.icon className="h-8 w-8 text-white" />
                    </motion.div>
                    <h4 className="text-xl font-playfair font-bold text-foreground mb-2">
                      {item.title}
                    </h4>
                    <p className="text-muted-foreground">
                      {item.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
