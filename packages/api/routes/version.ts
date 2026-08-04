import { Hono } from "hono";

import serverConfig from "@library/shared/config";
import { Context } from "@library/trpc";

const version = new Hono<{
  Variables: {
    ctx: Context;
  };
}>().get("/", (c) => {
  return c.json({
    version: serverConfig.serverVersion ?? "unknown",
  });
});

export default version;
