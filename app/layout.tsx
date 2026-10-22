import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Resolve It — Concerns deserve a response",
  description: "Send a concern to the right organization, privately and without creating an account."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
