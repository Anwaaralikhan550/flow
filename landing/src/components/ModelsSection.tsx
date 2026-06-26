import Image from "next/image";
import { ArrowUpRight, Crown, Film, Image as ImageIcon, Sparkles, Zap } from "lucide-react";

const models = [
  {
    name: "Veo 3.1",
    description: "State-of-the-art video generation with unprecedented quality and control.",
    label: "Video",
    icon: Film,
    image: "/assets/feature-ai-video-loop.jpeg",
    accent: "bg-cyan-300",
  },
  {
    name: "Imagen 4",
    description: "Photorealistic image synthesis with incredible detail and accuracy.",
    label: "Image",
    icon: ImageIcon,
    image: "/assets/feature-text-to-image.jpeg",
    accent: "bg-violet-300",
  },
  {
    name: "Nano Banana",
    description: "Fast, creative image generation for rapid iteration and experimentation.",
    label: "Image",
    icon: Zap,
    image: "/assets/feature-style-reimagine.jpeg",
    accent: "bg-amber-300",
  },
  {
    name: "Nano Banana 2 Pro",
    description: "Enhanced generation with higher fidelity, better coherence and premium quality.",
    label: "Image · Pro",
    icon: Crown,
    image: "/assets/feature-prompt-assist.jpeg",
    accent: "bg-rose-300",
  },
];

export function ModelsSection() {
  return (
    <section id="models" className="relative border-b border-line bg-[#050507] py-20 md:py-28">
      <div className="section-shell">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <div className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
            <Sparkles size={15} />
            Flow intelligence suite
          </div>
          <h2 className="text-4xl font-black leading-[1.04] tracking-[-0.045em] text-white md:text-6xl">
            Powered by Flow Creative Models
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/55 md:text-lg">
            A focused collection of creative models built for visual ideas, cinematic scenes, and polished output.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {models.map(({ name, description, label, icon: Icon, image, accent }) => (
            <article
              key={name}
              className="group overflow-hidden rounded-lg border border-white/15 bg-[#0a0a0f] transition duration-500 hover:-translate-y-2 hover:border-white/35 hover:shadow-[0_26px_80px_rgba(0,0,0,0.62)]"
            >
              <div className="relative aspect-[1.26/1] overflow-hidden bg-black">
                <Image
                  src={image}
                  alt={`${name} creative preview`}
                  fill
                  sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                  className="object-cover transition duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-black/10" />
                <div className="absolute left-4 top-4 grid size-10 place-items-center rounded-lg border border-white/20 bg-black/45 text-white backdrop-blur-md">
                  <Icon size={19} />
                </div>
                <div className={`absolute inset-x-0 bottom-0 h-0.5 ${accent}`} />
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/45">{label}</span>
                    <h3 className="mt-2 text-xl font-black tracking-[-0.025em] text-white">{name}</h3>
                  </div>
                  <ArrowUpRight className="mt-1 text-white/30 transition group-hover:text-white" size={19} />
                </div>
                <p className="mt-4 text-sm leading-6 text-white/55">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
