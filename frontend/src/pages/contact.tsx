import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, MapPin, Send, Clock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Footer from "@/components/footer";
import { apiRequest } from "@/lib/queryClient";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<{
    message: string;
    notice?: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setStatus("idle");
    setFeedback(null);

    try {
      const res = await apiRequest("POST", "/api/v1/contact", formData);
      const json = await res.json();

      if (json.success) {
        setStatus("success");
        let notice: string | undefined = undefined;
        if (json.data?.emailDelivered) {
          notice = "A notification has been sent directly to our team at renuscollection05@gmail.com.";
        } else if (json.data?.emailConfigured) {
          notice = "Your inquiry has been safely saved in our system. Email notifications are currently undergoing delivery verification.";
        } else {
          notice = "Your inquiry has been safely recorded in our system. Note: Email notifications are not yet configured on this server.";
        }
        setFeedback({
          message: json.message || "Thank you for contacting Renu's Collections! Your message has been received.",
          notice,
        });
        setFormData({ name: "", email: "", subject: "", message: "" });
      } else {
        setStatus("error");
        setFeedback({
          message: json.message || "We could not submit your message. Please check the information provided and try again.",
        });
      }
    } catch (err: any) {
      setStatus("error");
      const cleanMessage =
        err?.message?.replace(/^\d+:\s*/, "") ||
        "An unexpected error occurred while saving your message. Please try again shortly.";
      setFeedback({
        message: cleanMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-background pt-24 pb-16 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-6xl mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl md:text-5xl font-playfair font-bold text-primary mb-4"
          >
            Get in Touch
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Have questions about our luxury jewelry or custom studio designs? We'd love to hear from you.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Contact Info */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="bg-secondary/40 border-border h-full">
              <CardHeader>
                <CardTitle className="text-2xl font-playfair text-foreground">Contact Information</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Reach out to us directly through any of our official channels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-primary/15 rounded-lg flex-shrink-0">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Email</h3>
                    <a
                      href="mailto:renuscollection05@gmail.com"
                      className="text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
                    >
                      renuscollection05@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-primary/15 rounded-lg flex-shrink-0">
                    <Phone className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Phone</h3>
                    <a
                      href="tel:+918675178770"
                      className="text-muted-foreground hover:text-primary transition-colors block underline-offset-4 hover:underline"
                    >
                      +91 86751 78770
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-primary/15 rounded-lg flex-shrink-0">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Business Hours</h3>
                    <p className="text-muted-foreground">
                      Monday–Sunday, 10:00 AM–7:00 PM IST
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-primary/15 rounded-lg flex-shrink-0">
                    <MapPin className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Address</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Renu's Collections
                      <br />
                      MG Road, Jewelry District
                      <br />
                      Chennai, Tamil Nadu 600001
                      <br />
                      India
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="bg-card border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-2xl font-playfair text-foreground">Send us a Message</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Fill out the form below and our team will get back to you shortly
                </CardDescription>
              </CardHeader>
              <CardContent>
                {status === "success" && feedback && (
                  <div
                    role="alert"
                    className="mb-5 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start space-x-3"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm space-y-1">
                      <p className="font-medium">{feedback.message}</p>
                      {feedback.notice && (
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 opacity-90">
                          {feedback.notice}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {status === "error" && feedback && (
                  <div
                    role="alert"
                    className="mb-5 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start space-x-3"
                  >
                    <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">{feedback.message}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-foreground font-medium">Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      minLength={2}
                      maxLength={100}
                      disabled={isSubmitting}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
                      placeholder="Your name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      maxLength={255}
                      disabled={isSubmitting}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
                      placeholder="your@email.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject" className="text-foreground font-medium">Subject</Label>
                    <Input
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      minLength={2}
                      maxLength={200}
                      disabled={isSubmitting}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
                      placeholder="How can we help?"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-foreground font-medium">Message</Label>
                    <Textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      minLength={10}
                      maxLength={5000}
                      disabled={isSubmitting}
                      rows={5}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary resize-none"
                      placeholder="Tell us more about your inquiry..."
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all"
                    size="lg"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending Message...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>
      <br />
      <Footer />
    </div>
  );
}
