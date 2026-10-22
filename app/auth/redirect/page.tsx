"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTideCloak } from "@tidecloak/nextjs";

export default function AuthRedirect() {
  const { authenticated, isInitializing } = useTideCloak();
  const router = useRouter();
  useEffect(() => { if (!isInitializing) router.replace(authenticated ? "/organization" : "/"); }, [authenticated, isInitializing, router]);
  return <main className="portal-shell"><div className="portal-card">Completing secure sign-in…</div></main>;
}
