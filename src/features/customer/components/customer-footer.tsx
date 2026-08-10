"use client";

import { Camera, Mail, MapPin } from "lucide-react";
import Link from "next/link";

import { useLanguage } from "../language-provider";

export function CustomerFooter() {
  const { copy } = useLanguage();

  return (
    <footer className="border-border bg-surface border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div>
          <p className="text-gold text-sm font-semibold tracking-[0.2em] uppercase">
            Aureum Stays
          </p>
          <p className="text-muted mt-2 text-sm">{copy.footer}</p>
        </div>
        <div className="text-muted flex items-center gap-5">
          <a
            aria-label={copy.accessibility.email}
            className="hover:text-gold -m-2 rounded-md p-2 transition"
            href="mailto:hello@aureumstays.com"
          >
            <Mail size={18} />
          </a>
          <Link
            aria-label={copy.accessibility.collection}
            className="hover:text-gold -m-2 rounded-md p-2 transition"
            href="/#collection"
          >
            <Camera size={18} />
          </Link>
          <span className="flex items-center gap-1.5 text-sm">
            <MapPin size={16} /> {copy.accessibility.location}
          </span>
        </div>
      </div>
    </footer>
  );
}
