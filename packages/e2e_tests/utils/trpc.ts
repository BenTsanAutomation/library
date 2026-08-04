import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@library/trpc/routers/_app";

export function getTrpcClient(apiKey?: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        transformer: superjson,
        url: `http://localhost:${process.env.LIBRARY_PORT}/api/trpc`,
        headers() {
          return {
            authorization: apiKey ? `Bearer ${apiKey}` : undefined,
          };
        },
      }),
    ],
  });
}
