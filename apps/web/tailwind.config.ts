import type { Config } from "tailwindcss";

import web from "@library/tailwind-config/web";

const config = {
  content: [
    ...web.content,
    "../../packages/shared-react/components/**/*.{ts,tsx}",
  ],
  presets: [web],
  theme: {
    extend: {
      fontFamily: {
        body: ["var(--font-body)"],
        display: ["var(--font-display)"],
      },
    },
  },
} satisfies Config;

export default config;
