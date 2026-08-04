import {
  ArrowDownNarrowWide,
  Bookmark,
  BrainCircuit,
  CheckCheck,
  Highlighter,
  Plug,
  Rss,
  Server,
  SunMoon,
  TextSearch,
  Users,
  Workflow,
} from "lucide-react";

import CallToAction from "./components/CallToAction";
import FeaturesGrid from "./components/FeaturesGrid";
import OpenSource from "./components/OpenSource";
import Platforms from "./components/Platforms";

const featuresList = [
  {
    icon: Bookmark,
    title: "Save anything worth keeping",
    description:
      "Capture links, notes, images, and PDFs with titles, previews, and context already in place.",
  },
  {
    icon: BrainCircuit,
    title: "Gentle AI organization",
    description:
      "Let Library suggest tags and structure so your collection stays useful without extra filing work.",
  },
  {
    icon: Users,
    title: "Shared spaces",
    description:
      "Build collaborative lists for research, teams, or households without losing personal clarity.",
  },
  {
    icon: Rss,
    title: "Feeds that come to you",
    description:
      "Bring in articles and updates automatically from RSS sources you already trust.",
  },
  {
    icon: Workflow,
    title: "Rules that tidy in the background",
    description:
      "Set simple automations for tagging, sorting, and routing new saves as they arrive.",
  },
  {
    icon: Highlighter,
    title: "Highlights with memory",
    description:
      "Keep the passages that mattered, linked back to the source and easy to revisit later.",
  },
  {
    icon: Plug,
    title: "Connect your stack",
    description:
      "Use webhooks and the API to fit Library into your existing workflows and tools.",
  },
  {
    icon: TextSearch,
    title: "Search across everything",
    description:
      "Find ideas by title, text, notes, and metadata instead of remembering where you saved them.",
  },
  {
    icon: Server,
    title: "Self-host when you want control",
    description:
      "Run Library on your own infrastructure when privacy, portability, or ownership matters most.",
  },
  {
    icon: CheckCheck,
    title: "Useful bulk actions",
    description:
      "Clean up, archive, retag, and organize large sets of saves without repetitive clicks.",
  },
  {
    icon: ArrowDownNarrowWide,
    title: "Rich previews automatically",
    description:
      "Library fetches descriptions, thumbnails, and page details so saved items stay legible later.",
  },
  {
    icon: SunMoon,
    title: "Comfortable day and night",
    description:
      "A calm interface in light or dark mode that keeps reading and browsing easy on the eyes.",
  },
];

const curatedMoments = [
  {
    eyebrow: "Capture",
    title: "A calmer place to keep what matters",
    description:
      "Library turns quick saves into a visual, searchable collection you can actually return to. The experience is intentionally light, quiet, and easy to scan.",
    points: [
      "One-click saving from web, mobile, and extensions",
      "Readable previews instead of raw clutter",
      "Notes, links, images, and PDFs living together naturally",
    ],
  },
  {
    eyebrow: "Organize",
    title: "Less filing, more finding",
    description:
      "Use AI tagging, lists, highlights, and search to build a collection that stays useful as it grows. Library helps structure emerge without feeling like work.",
    points: [
      "Search by content, not just memory",
      "Shared lists for people and projects",
      "Automation rules for background order",
    ],
  },
];

export default function Homepage() {
  return (
    <>
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(246,232,214,0.9),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(214,230,224,0.8),_transparent_30%),linear-gradient(180deg,_#f8f5ef_0%,_#f5f1ea_46%,_#f7f4ee_100%)] px-4 pb-20 pt-16 sm:pb-28 sm:pt-24">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-stone-300/70 bg-white/80 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.22em] text-stone-600 shadow-sm backdrop-blur">
              Calm editorial minimalism for your saved world
            </div>
            <h1 className="mt-6 font-serif text-5xl leading-[0.95] tracking-tight text-stone-900 sm:text-6xl lg:text-7xl">
              Library is your quiet home for everything worth keeping.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600 sm:text-xl">
              Save links, notes, highlights, images, and PDFs into a space that
              feels organized from the start — clear, visual, and effortless to
              come back to.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="https://cloud.library.example.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-stone-50 shadow-[0_14px_30px_rgba(35,30,24,0.16)] transition hover:-translate-y-0.5 hover:bg-stone-800"
              >
                Open Library Cloud
              </a>
              <a
                href="/apps"
                className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white/80 px-6 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-white"
              >
                Explore apps & extensions
              </a>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                ["Capture", "Links, notes, files, and highlights"],
                ["Organize", "AI tags, lists, search, and rules"],
                ["Own it", "Cloud or self-hosted, same core product"],
              ].map(([title, text]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_10px_35px_rgba(83,66,44,0.07)] backdrop-blur"
                >
                  <p className="text-sm font-semibold text-stone-900">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_18px_50px_rgba(68,57,43,0.12)] backdrop-blur sm:translate-y-10">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Today’s library
              </p>
              <div className="mt-5 space-y-3">
                {[
                  ["Design systems for later", "Saved from Safari · tagged design, systems"],
                  ["Research notes", "Text note · 4 highlights collected"],
                  ["Reference moodboard", "Image set · shared with team"],
                ].map(([title, meta], index) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-stone-200/80 bg-stone-50/90 p-4"
                  >
                    <div className="mb-3 h-28 rounded-[1.25rem] bg-[linear-gradient(135deg,_#ddd4c8,_#f4ece2_55%,_#d9e5df)]" />
                    <p className="text-base font-medium text-stone-900">{title}</p>
                    <p className="mt-1 text-sm text-stone-500">{meta}</p>
                    <div className="mt-3 flex gap-2">
                      {["calm", "useful", index === 1 ? "writing" : "visual"].map(
                        (tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white px-2.5 py-1 text-xs text-stone-600"
                          >
                            {tag}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[2rem] border border-stone-200 bg-[#fcfaf7] p-6 shadow-[0_18px_50px_rgba(68,57,43,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Why it feels lighter
                </p>
                <div className="mt-5 space-y-4">
                  {curatedMoments.map((moment) => (
                    <div key={moment.title} className="rounded-2xl bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                        {moment.eyebrow}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-stone-900">
                        {moment.title}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {moment.description}
                      </p>
                      <ul className="mt-4 space-y-2 text-sm text-stone-600">
                        {moment.points.map((point) => (
                          <li key={point} className="flex gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-stone-400" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[2rem] border border-stone-200 bg-stone-900 p-6 text-stone-50 shadow-[0_18px_50px_rgba(22,20,18,0.18)]">
                <p className="text-sm uppercase tracking-[0.22em] text-stone-300">
                  Built for return visits
                </p>
                <p className="mt-3 text-xl leading-8 text-stone-100">
                  Save first. Structure follows. Library keeps your future self in
                  mind.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <FeaturesGrid features={featuresList} />
      <Platforms />
      <OpenSource />
      <CallToAction />
    </>
  );
}
