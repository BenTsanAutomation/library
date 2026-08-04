import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CLOUD_SIGNUP_LINK, DEMO_LINK } from "../constants";

export default function CallToAction() {
  return (
    <section className="bg-[#f3ede3] px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(135deg,_#2a2926_0%,_#3a352f_44%,_#4a4339_100%)] px-8 py-16 text-center shadow-[0_24px_60px_rgba(47,38,28,0.2)] sm:px-16">
        <h2 className="font-serif text-3xl tracking-tight text-white sm:text-5xl">
          Start building a library you’ll actually revisit.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-stone-200">
          Save first, sort later, and let Library keep the experience calm while
          your collection grows.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={CLOUD_SIGNUP_LINK}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "w-full gap-2 rounded-full bg-white px-8 text-stone-900 hover:bg-stone-100 sm:w-auto",
              buttonVariants({ size: "lg" }),
            )}
          >
            Get started free
          </a>
          <a
            href={DEMO_LINK}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "w-full gap-2 rounded-full border-white/30 px-8 text-white hover:bg-white/10 sm:w-auto",
              buttonVariants({ variant: "outline", size: "lg" }),
            )}
          >
            Try the demo
          </a>
        </div>
      </div>
    </section>
  );
}
