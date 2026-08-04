import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import Logo from "./Logo";
import usePluginSettings from "./utils/settings";
import { isHttpUrl } from "./utils/url";

export default function NotConfiguredPage() {
  const navigate = useNavigate();

  const { settings, setSettings } = usePluginSettings();

  const [error, setError] = useState("");
  const [serverAddress, setServerAddress] = useState(settings.address);

  useEffect(() => {
    setServerAddress(settings.address);
  }, [settings.address]);

  const onSave = () => {
    const input = serverAddress.trim();
    if (input == "") {
      setError("Server address is required");
      return;
    }

    if (!isHttpUrl(input)) {
      setError("Server address must start with http:// or https://");
      return;
    }

    setSettings((s) => ({ ...s, address: input.replace(/\/$/, "") }));
    navigate("/signin");
  };

  return (
    <div className="flex flex-col space-y-4 rounded-[1.5rem] border border-border/70 bg-[linear-gradient(180deg,rgba(250,247,242,0.98)_0%,rgba(255,255,255,0.98)_100%)] p-5 shadow-[0_18px_40px_rgba(63,50,36,0.08)]">
      <Logo />
      <div className="space-y-1 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Welcome to Library
        </p>
        <span className="block text-sm text-foreground">
          Connect the extension to your Library server to start saving pages.
        </span>
      </div>
      <p className="text-sm text-red-500">{error}</p>
      <div className="flex gap-2">
        <label className="my-auto text-sm text-muted-foreground">Server</label>
        <Input
          name="address"
          value={serverAddress}
          className="h-9 flex-1 rounded-lg border border-gray-300 p-2"
          onChange={(e) => setServerAddress(e.target.value)}
        />
      </div>
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => navigate("/customheaders")}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Configure custom headers
          {settings.customHeaders &&
            Object.keys(settings.customHeaders).length > 0 &&
            ` (${Object.keys(settings.customHeaders).length})`}
        </button>
      </div>
      <Button onClick={onSave}>Connect Library</Button>
    </div>
  );
}
