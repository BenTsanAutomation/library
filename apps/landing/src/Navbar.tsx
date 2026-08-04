import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

import { CLOUD_SIGNUP_LINK, DOCS_LINK, GITHUB_LINK } from "./constants";
import Logo from "/icons/logo-full.svg?url";

export default function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-stone-200/70 bg-stone-50/80 backdrop-blur-2xl">
      <div className="container flex items-center justify-between px-4 py-4">
        <a href="/" aria-label="Library" className="flex items-center gap-3">
          <img src={Logo} alt="Library" className="w-32 text-stone-900" />
        </a>

        <div className="hidden items-center gap-7 md:flex">
          <a
            href="/pricing"
            className="text-[15px] text-stone-600 transition-colors hover:text-stone-900"
          >
            Pricing
          </a>
          <a
            href="/apps"
            className="text-[15px] text-stone-600 transition-colors hover:text-stone-900"
          >
            Apps
          </a>
          <a
            href={DOCS_LINK}
            target="_blank"
            className="text-[15px] text-stone-600 transition-colors hover:text-stone-900"
            rel="noreferrer"
          >
            Docs
          </a>
          <a
            href={GITHUB_LINK}
            target="_blank"
            className="text-[15px] text-stone-600 transition-colors hover:text-stone-900"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://cloud.library.example.com"
            target="_blank"
            className="ml-2 text-[15px] text-stone-600 transition-colors hover:text-stone-900"
            rel="noreferrer"
          >
            Sign in
          </a>
          <a
            href={CLOUD_SIGNUP_LINK}
            target="_blank"
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-stone-900 px-5 text-[15px] font-medium text-stone-50 shadow-[0_14px_30px_rgba(35,30,24,0.14)] transition-all hover:-translate-y-0.5 hover:bg-stone-800",
              "h-10",
            )}
            rel="noreferrer"
          >
            Get started
          </a>
        </div>

        <button
          className="rounded-full border border-stone-200 bg-white/90 p-2 md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="size-5 text-stone-700" />
          ) : (
            <Menu className="size-5 text-stone-700" />
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-stone-200/60 bg-stone-50/95 px-4 pb-5 pt-3 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-4">
            <a
              href="/pricing"
              className="text-[15px] text-stone-600 hover:text-stone-900"
              onClick={() => setMobileOpen(false)}
            >
              Pricing
            </a>
            <a
              href="/apps"
              className="text-[15px] text-stone-600 hover:text-stone-900"
              onClick={() => setMobileOpen(false)}
            >
              Apps
            </a>
            <a
              href={DOCS_LINK}
              target="_blank"
              className="text-[15px] text-stone-600 hover:text-stone-900"
              rel="noreferrer"
            >
              Docs
            </a>
            <a
              href={GITHUB_LINK}
              target="_blank"
              className="text-[15px] text-stone-600 hover:text-stone-900"
              rel="noreferrer"
            >
              GitHub
            </a>
            <div className="mt-1 flex gap-3">
              <a
                href="https://cloud.library.example.com"
                target="_blank"
                className={cn(
                  "flex-1 rounded-full border-stone-300 bg-white",
                  buttonVariants({ variant: "outline", size: "sm" }),
                )}
                rel="noreferrer"
              >
                Sign in
              </a>
              <a
                href={CLOUD_SIGNUP_LINK}
                target="_blank"
                className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-stone-900 px-4 text-sm font-medium text-stone-50 hover:bg-stone-800"
                rel="noreferrer"
              >
                Get started
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
