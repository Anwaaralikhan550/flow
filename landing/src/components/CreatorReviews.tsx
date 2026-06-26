import { Star } from "lucide-react";

const reviews = [
  {
    quote:
      "The extension makes the workflow feel effortless. I can move from an idea to a polished visual without breaking focus.",
    name: "Sabrina M.",
    plan: "Ultra Plan",
    initials: "SM",
    color: "from-violet-500 to-fuchsia-500",
  },
  {
    quote:
      "Flow gives my channel a consistent creative rhythm. Drafting visuals and testing new concepts is much faster now.",
    name: "Tanvir Khan",
    plan: "Pro Plan",
    initials: "TK",
    color: "from-cyan-400 to-blue-500",
  },
  {
    quote:
      "The interface is clean and the creative tools are easy to understand. I spend more time making and less time searching.",
    name: "Lina A.",
    plan: "Ultra Plan",
    initials: "LA",
    color: "from-fuchsia-500 to-rose-500",
  },
  {
    quote:
      "The image quality surprised me. Upscale and style exploration fit naturally into the way I prepare client concepts.",
    name: "Rayan S.",
    plan: "Pro Plan",
    initials: "RS",
    color: "from-amber-300 to-orange-500",
  },
  {
    quote:
      "A focused toolkit with no clutter. It has become my starting point whenever a new campaign needs visual directions.",
    name: "Mina R.",
    plan: "Basic Plan",
    initials: "MR",
    color: "from-emerald-400 to-cyan-500",
  },
  {
    quote:
      "Fast iterations make a real difference. I can explore more variations before choosing the final look for a project.",
    name: "David T.",
    plan: "Pro Plan",
    initials: "DT",
    color: "from-indigo-400 to-violet-500",
  },
];

function ReviewCard({ review }: { review: (typeof reviews)[number] }) {
  return (
    <article className="flex min-h-72 w-[19rem] shrink-0 flex-col justify-between rounded-lg border border-white/15 bg-[#09090e] p-6 transition duration-500 hover:-translate-y-1 hover:border-violet-300/45 hover:bg-[#0d0c15] sm:w-[26rem]">
      <div>
        <div className="mb-6 flex gap-1 text-violet-300">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star key={index} size={14} fill="currentColor" strokeWidth={1.5} />
          ))}
        </div>
        <p className="text-base leading-7 text-white/78">&ldquo;{review.quote}&rdquo;</p>
      </div>
      <div className="mt-8 flex items-center gap-3">
        <div
          className={`grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br ${review.color} text-sm font-black text-white`}
        >
          {review.initials}
        </div>
        <div>
          <h3 className="font-bold text-white">{review.name}</h3>
          <p className="mt-1 text-sm font-medium text-violet-300">{review.plan}</p>
        </div>
      </div>
    </article>
  );
}

export function CreatorReviews() {
  return (
    <section className="relative border-b border-line bg-[#050507] py-20 md:py-28">
      <div className="section-shell mb-11 text-center md:mb-14">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Creator stories</p>
        <h2 className="text-4xl font-black tracking-[-0.045em] text-white md:text-6xl">Loved by Creators</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/55 md:text-lg">
          Feedback from creators building visual ideas with a faster, more focused workflow.
        </p>
      </div>

      <div className="reviews-viewport">
        <div className="reviews-track">
          {[0, 1].map((group) => (
            <div key={group} className="flex shrink-0 gap-4 pr-4" aria-hidden={group === 1}>
              {reviews.map((review) => (
                <ReviewCard key={`${group}-${review.initials}`} review={review} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
