import { PluginManager } from "@library/shared/plugins";

let pluginsLoaded = false;
export async function loadAllPlugins() {
  if (pluginsLoaded) {
    return;
  }
  // Load plugins here. Order of plugin loading matter.
  // Queue provider(s)
  await import("@library/plugins/queue-liteque");
  await import("@library/plugins/queue-restate");
  await import("@library/plugins/search-meilisearch");
  // Rate limiters (order matters - last one wins)
  await import("@library/plugins/ratelimit-memory");
  await import("@library/plugins/ratelimit-redis");
  PluginManager.logAllPlugins();
  pluginsLoaded = true;
}
