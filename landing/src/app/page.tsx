import { CreatorReviews } from "@/components/CreatorReviews";
import { FeatureGrid } from "@/components/FeatureGrid";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { ModelsSection } from "@/components/ModelsSection";
import { Pricing } from "@/components/Pricing";
import { ProductShowcase } from "@/components/ProductShowcase";
import { StatsStrip } from "@/components/StatsStrip";
import { SupportButton } from "@/components/SupportButton";
import { VideoTutorials } from "@/components/VideoTutorials";

export default function Home() {
  return (
    <main className="overflow-hidden">
      <Hero />
      <StatsStrip />
      <HowItWorks />
      <ProductShowcase />
      <ModelsSection />
      <FeatureGrid />
      <CreatorReviews />
      <VideoTutorials />
      <Pricing />
      <Footer />
      <SupportButton />
    </main>
  );
}
