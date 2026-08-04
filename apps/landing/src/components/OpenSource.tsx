import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Github } from "lucide-react";

import { DOCS_LINK, GITHUB_LINK } from "../constants";

export default function OpenSource() {
  return (
    <section className="bg-stone-900 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Github className="mx-auto size-12 text-white" />
        <h2 className="mt-6 font-serif text-3xl tracking-tight text-white sm:text-4xl">
          Open source, and easy to make your own
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-stone-300">
          Library is fully open source. Self-host it with Docker, keep control
          of your data, and shape the product alongside the community.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={GITHUB_LINK}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "gap-2 rounded-full bg-white px-8 text-stone-900 hover:bg-stone-100",
              buttonVariants({ size: "lg" }),
            )}
          >
            <Github className="size-5" /> View on GitHub
          </a>
          <a
            href={`${DOCS_LINK}/installation/docker`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-stone-600 px-8 text-base font-medium text-white transition-colors hover:bg-stone-800"
          >
            Self-hosting docs
          </a>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">24k+</div>
            <div className="mt-1 text-stone-400">GitHub Stars</div>
          </div>
          <div className="h-8 w-px bg-stone-700" />
          <div className="text-center">
            <div className="text-3xl font-bold text-white">150+</div>
            <div className="mt-1 text-stone-400">Contributors</div>
          </div>
        </div>
      </div>
    </section>
  );
}
