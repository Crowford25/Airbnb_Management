import type { Metadata } from "next";

import { AuthProvider } from "@/features/auth/auth-provider";
import { getSession } from "@/features/auth/server/session";
import { LanguageProvider } from "@/features/customer/language-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Aureum Stays", template: "%s | Aureum Stays" },
  description: "Luxury property management, thoughtfully curated.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="en" className="bg-background h-full antialiased">
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <AuthProvider initialUser={session?.user}>
          <LanguageProvider>{children}</LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
