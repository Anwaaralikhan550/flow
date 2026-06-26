import Image from "next/image";
import { Image as ImageIcon, Maximize2, Palette, PlaySquare, ShieldCheck, WandSparkles } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const features = [
  {
    title: "Text to Image",
    description: "Turn prompts into polished visual concepts with a focused generation workflow.",
    icon: ImageIcon,
    image: "/assets/feature-text-to-image.jpeg",
  },
  {
    title: "AI Video Loop",
    description: "Keep the approved 20-credit generation loop accessible for consistent client-side creation.",
    icon: PlaySquare,
    image: "/assets/feature-ai-video-loop.jpeg",
  },
  {
    title: "Upscale",
    description: "Enhance outputs with crisp, high-resolution detail while preserving visual intent.",
    icon: Maximize2,
    image: "/assets/feature-upscale.jpeg",
  },
  {
    title: "Style Reimagine",
    description: "Explore visual directions with cinematic color, lighting, and composition presets.",
    icon: Palette,
    image: "/assets/feature-style-reimagine.jpeg",
  },
  {
    title: "Secure Licensing",
    description: "JWT-bound policies, device locking, and subscription checks keep usage controlled.",
    icon: ShieldCheck,
    image: "/assets/feature-secure-licensing.jpeg",
  },
  {
    title: "Prompt Assist",
    description: "Guide users toward cleaner prompts and faster iteration without cluttering the interface.",
    icon: WandSparkles,
    image: "/assets/feature-prompt-assist.jpeg",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative border-b border-line py-20 md:py-28">
      <div className="absolute left-0 top-20 h-72 w-72 rounded-full bg-electric/10 blur-3xl" />
      <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-violet/10 blur-3xl" />
      <div className="section-shell">
        <SectionHeading
          eyebrow="Cinematic creation stack"
          title="Every tool feels like a video model."
          description="Realistic image generation, motion-first workflows, upscale passes, and secure licensing shaped into one focused creator surface."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ title, description, icon: Icon, image }, index) => (
            <article
              key={title}
              className="video-card glass-card group rounded-2xl p-6"
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <div className="relative mb-7 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
                <Image
                  src={image}
                  alt={`${title} preview`}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <div className="mb-6 grid size-11 place-items-center rounded-xl border border-cyan/25 bg-cyan/10 text-cyan-100 shadow-glow">
                <Icon size={20} />
              </div>
              <h3 className="text-lg font-black text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-smoke">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
