import type { Config } from "tailwindcss";

import web from "@library/tailwind-config/web";

const config = {
  content: [...(web.content as string[]), "src/**/*.astro"],
  presets: [web],
  theme: {},
} satisfies Config;

export default config;
