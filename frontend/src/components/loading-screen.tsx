import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface LoadingScreenProps {
  onFinishLoading: () => void;
}

export function LoadingScreen({ onFinishLoading }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadingInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(loadingInterval);
          setIsLoaded(true);
          return 100;
        }
        return prev + 5;
      });
    }, 30);

    return () => clearInterval(loadingInterval);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background text-foreground"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Loading Image */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="absolute inset-0 w-full h-full"
      >
        <img
          src="/assets/loading-screen.png"
          alt="Renu's Collections Loading"
          className="w-full h-full object-cover"
        />
      </motion.div>

      {/* Progress Bar */}
      <motion.div
        className="mt-8 w-64"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
      >
        <Progress value={progress} className="h-2 bg-primary/20" />
      </motion.div>

      {/* Enter button */}
      <AnimatePresence>
        {isLoaded && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-10"
          >
            <Button
              onClick={onFinishLoading}
              className="bg-rose-gold text-matte-black hover:bg-rose-gold/90 px-8 py-3 text-lg font-playfair rounded-md transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              Enter World
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}