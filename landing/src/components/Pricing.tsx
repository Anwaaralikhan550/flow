import { Check } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const plans = [
  {
    name: "Pro",
    price: "Contact Your Reseller",
    credits: "25,000",
    videos: "750",
    description: "For creators who need reliable daily generation access.",
    features: [
      "25,000 credits per month",
      "750 AI videos / month",
      "Google Flow managed access",
      "15-day satisfaction warranty",
      "Session auto-rotation every 24h",
      "Credit tracking dashboard",
      "Reseller support",
    ],
  },
  {
    name: "Ultra",
    price: "Contact Your Reseller",
    credits: "45,000",
    videos: "1,250",
    description: "For high-volume creators who need more monthly output.",
    featured: true,
    badge: "Most Popular",
    features: [
      "45,000 credits per month",
      "1,250 AI videos / month",
      "Google Flow managed access",
      "Veo 3.1 - Fast unlocked",
      "Veo 3.1 - Fast (Lower Priority) unlocked",
      "Priority session pool",
      "Full generation history",
      "Priority reseller support",
      "Early access to new features",
    ],
  },
  {
    name: "Flow Unlimited",
    price: "Contact Your Reseller",
    credits: "∞",
    videos: "∞",
    description: "For resellers and teams who need unrestricted creative capacity.",
    badge: "Best Value",
    features: [
      "Unlimited credits",
      "Unlimited AI videos",
      "Veo 3.1 - Fast unlocked",
      "Priority session pool",
      "Full generation history",
      "Priority reseller support",
      "Early access to new features",
      "Dedicated account manager",
      "Custom session allocation",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-28">
      <div className="section-shell">
        <SectionHeading
          eyebrow="Simple plans"
          title="Choose the right creation tier"
          description="Clean subscription options for customers, creators, and teams. Purchases are handled through support."
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`glass-card relative flex h-full min-h-[720px] flex-col overflow-hidden rounded-2xl border-[2.5px] p-6 ${
                plan.featured ? "border-violet/70 bg-violet/10 shadow-glow" : ""
              }`}
            >
              {plan.badge ? (
                <div className="absolute right-5 top-5 rounded-full bg-gradient-to-r from-violet to-fuchsia-500 px-4 py-1.5 text-[0.68rem] font-black uppercase tracking-[-0.01em] text-white shadow-[0_18px_60px_rgba(168,85,247,0.32)]">
                  {plan.badge}
                </div>
              ) : null}

              <h3 className="text-2xl font-black tracking-[-0.025em] text-white">{plan.name}</h3>
              <p className="mt-2 text-sm leading-6 text-smoke">{plan.price}</p>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="rounded-xl border-[2.5px] border-white/10 bg-white/[0.04] p-4 text-center">
                  <p className="text-2xl font-black leading-none tracking-[-0.035em] text-white md:text-3xl">
                    {plan.credits}
                  </p>
                  <p className="mt-3 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-white/35">Credits</p>
                </div>
                <div className="rounded-xl border-[2.5px] border-white/10 bg-white/[0.04] p-4 text-center">
                  <p className="text-2xl font-black leading-none tracking-[-0.035em] text-white md:text-3xl">
                    {plan.videos}
                  </p>
                  <p className="mt-3 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-white/35">AI Videos</p>
                </div>
              </div>

              <p className="mt-6 text-sm leading-6 text-smoke">{plan.description}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-[0.84rem] leading-5 text-smoke">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-violet/20 text-violet-200">
                      <Check size={11} strokeWidth={2.6} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href="https://wa.me/923475505054?text=Hi%20Admin%2C%20I%20want%20to%20purchase%20Vidgen."
                id={plan.name === "Pro" ? "download" : undefined}
                className={`mt-8 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-black transition ${
                  plan.featured
                    ? "bg-gradient-to-r from-violet to-electric text-white shadow-glow hover:scale-[1.02]"
                    : "border border-line bg-white text-void hover:border-violet"
                }`}
              >
                Contact Support to Purchase
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
