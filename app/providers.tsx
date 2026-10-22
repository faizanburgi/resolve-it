"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { TideCloakProvider } from "@tidecloak/nextjs";

type State = { ready: boolean; configured: boolean };
const TideConfigState = createContext<State>({ ready: false, configured: false });
export const useTideConfigState = () => useContext(TideConfigState);

export function Providers({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ ready: false, configured: false });
  const [config, setConfig] = useState<any>(null);
  useEffect(() => {
    fetch("/api/tide-config", { cache: "no-store" }).then(r => r.json()).then(data => {
      setConfig(data.configured ? data.config : null);
      setState({ ready: true, configured: Boolean(data.configured) });
    }).catch(() => setState({ ready: true, configured: false }));
  }, []);
  return <TideConfigState.Provider value={state}>{config ? <TideCloakProvider config={config}>{children}</TideCloakProvider> : children}</TideConfigState.Provider>;
}
