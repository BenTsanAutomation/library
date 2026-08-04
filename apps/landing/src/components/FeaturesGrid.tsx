import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function FeaturesGrid({ features }: { features: Feature[] }) {
  return (
    <section className="bg-[#f6f1e9] px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
            Built to feel useful at a glance
          </p>
          <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-900 sm:text-5xl">
            Everything you need, without the usual clutter.
          </h2>
          <p className="mt-4 text-lg leading-8 text-stone-600">
            Library brings capture, organization, and rediscovery into one calm
            system with softer surfaces and clearer hierarchy.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-[1.75rem] border border-white/80 bg-white/85 p-6 shadow-[0_12px_40px_rgba(89,72,50,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-stone-200 hover:shadow-[0_18px_45px_rgba(89,72,50,0.12)]"
            >
              <div className="mb-5 inline-flex rounded-2xl bg-stone-100 p-3 text-stone-700 transition-colors group-hover:bg-stone-900 group-hover:text-stone-50">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-stone-900">
                {feature.title}
              </h3>
              <p className="text-sm leading-6 text-stone-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
