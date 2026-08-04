import { initEventLogger, initTracing } from "@library/shared-server";

initTracing("web");
initEventLogger("web");
