"use client";

import { Globe2, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AuthNav } from "@/features/auth/components/auth-nav";

import { useLanguage } from "../language-provider";

export function CustomerHeader() {
  const { copy, locale, setLocale } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navItems = [
    { href: "/properties", label: copy.nav.stays },
    { href: "/#collection", label: copy.nav.collection },
    { href: "/#story", label: copy.nav.about },
  ];

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <header className="bg-background/90 relative z-20 border-b border-white/10 backdrop-blur-lg">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link className="group flex items-center gap-3" href="/" onClick={closeMenu}>
          <span className="border-gold text-gold group-hover:bg-gold group-hover:text-background grid size-9 place-items-center rounded-full border text-sm transition">
            A
          </span>
          <span className="text-foreground text-xs font-semibold tracking-[0.24em] uppercase sm:text-sm">
            Aureum Stays
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => (
            <Link
              className="text-muted hover:text-gold text-sm transition"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <button
            aria-label={copy.accessibility.changeLanguage}
            className="text-muted hover:text-gold flex items-center gap-1.5 text-sm transition"
            onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}
            type="button"
          >
            <Globe2 size={16} /> {locale === "en" ? "中文" : "EN"}
          </button>
          <AuthNav labels={copy.auth} />
        </div>

        <button
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="border-border text-foreground grid size-10 place-items-center rounded-md border lg:hidden"
          onClick={() => setIsMenuOpen((open) => !open)}
          type="button"
        >
          {isMenuOpen ? <X size={19} /> : <Menu size={20} />}
        </button>
      </div>

      {isMenuOpen ? (
        <div className="border-border bg-surface border-t px-5 py-5 lg:hidden">
          <nav aria-label="Mobile navigation" className="flex flex-col gap-4">
            {navItems.map((item) => (
              <Link
                className="text-foreground text-sm"
                href={item.href}
                key={item.href}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
            <button
              aria-label={copy.accessibility.changeLanguage}
              className="text-muted flex w-fit items-center gap-1.5 text-sm"
              onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}
              type="button"
            >
              <Globe2 size={16} /> {locale === "en" ? "中文" : "EN"}
            </button>
            <div className="pt-1" onClick={closeMenu}>
              <AuthNav labels={copy.auth} />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
