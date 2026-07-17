import type { Metadata } from "next";
import { headers } from "next/headers";
import AuthTokenInit from "@/components/AuthTokenInit";
import packageJson from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sparkly Tails — Tiered Pricing",
  description: "Volume pricing admin",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authToken = (await headers()).get("x-auth-token") ?? "";

  return (
    <html lang="en">
      <body>
        <AuthTokenInit initialToken={authToken} />
        <div className="text-xs text-gray-400 text-right px-4 pt-1">
          v{packageJson.version}
        </div>
        {children}
      </body>
    </html>
  );
}
