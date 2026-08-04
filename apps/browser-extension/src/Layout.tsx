import { Home, RefreshCw, Settings, X } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import usePluginSettings from "./utils/settings";

export default function Layout() {
  const navigate = useNavigate();
  const { settings, isPending: isInit } = usePluginSettings();
  if (!isInit) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!settings.apiKey || !settings.address) {
    navigate("/notconfigured");
    return;
  }

  return (
    <div className="flex flex-col space-y-3">
      <div className="rounded-[1.5rem] border border-border/70 bg-[linear-gradient(180deg,rgba(250,247,242,0.98)_0%,rgba(255,255,255,0.98)_100%)] p-4 shadow-[0_14px_35px_rgba(63,50,36,0.08)] dark:bg-gray-900">
        <Outlet />
      </div>
      <div className="rounded-full border border-border/70 bg-card/80 px-4 py-3 shadow-sm">
        <div className="flex justify-between space-x-3">
          <div className="my-auto">
            <a
              className="flex gap-2 text-foreground"
              target="_blank"
              rel="noreferrer"
              href={`${settings.address}/dashboard/bookmarks`}
            >
              <Home />
              <span className="text-md my-auto">Library</span>
            </a>
          </div>
          <div className="flex space-x-3">
            {process.env.NODE_ENV == "development" && (
              <Button onClick={() => navigate(0)}>
                <RefreshCw className="w-4" />
              </Button>
            )}
            <Button onClick={() => navigate("/options")}>
              <Settings className="w-4" />
            </Button>
            <Button onClick={() => window.close()}>
              <X className="w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
