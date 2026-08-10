"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { Property } from "../content";
import { useLanguage } from "../language-provider";
import { CustomerFooter } from "./customer-footer";
import { CustomerHeader } from "./customer-header";
import { PropertyCard } from "./property-card";
import { SearchPanel } from "./search-panel";

export function CustomerLanding({ properties }: { properties: Property[] }) {
  const { copy } = useLanguage();

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-hidden">
      <CustomerHeader />
      <main className="flex-1">
        <section className="border-border relative isolate overflow-hidden border-b px-5 pt-16 pb-28 sm:px-8 sm:pt-24 lg:px-10 lg:pb-36">
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_76%_24%,rgba(198,161,91,.2),transparent_18%),radial-gradient(circle_at_92%_60%,rgba(110,78,39,.28),transparent_28%),linear-gradient(120deg,#0a0a0a_15%,#15130f_64%,#0a0a0a_100%)]" />
          <div className="border-gold/20 from-gold/20 absolute top-16 right-[-9rem] -z-10 hidden size-[34rem] rotate-[-14deg] rounded-[4rem] border bg-linear-to-br via-transparent to-black/20 shadow-2xl shadow-black/50 lg:block" />
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1fr_.72fr] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-gold text-xs font-semibold tracking-[0.24em] uppercase">
                {copy.hero.eyebrow}
              </p>
              <h1 className="mt-6 text-5xl font-semibold tracking-[-0.05em] text-balance sm:text-6xl lg:text-7xl">
                {copy.hero.title}
              </h1>
              <p className="text-muted mt-7 max-w-xl text-base leading-8 sm:text-lg">
                {copy.hero.description}
              </p>
              <Link
                className="border-gold text-gold mt-9 inline-flex items-center gap-2 border-b pb-2 text-sm font-semibold transition hover:gap-3"
                href="#collection"
              >
                {copy.hero.explore} <ArrowDownRight size={17} />
              </Link>
            </div>
            <div className="border-gold/20 relative min-h-72 overflow-hidden rounded-2xl border shadow-2xl shadow-black/40 sm:min-h-96 lg:min-h-[30rem]">
              <Image
                alt="The Atlas Villa's open-air living pavilion"
                className="object-cover"
                fill
                priority
                sizes="(max-width: 1023px) 100vw, 42vw"
                src="/properties/the-atlas-villa-1.png"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-black/5" />
              <div className="absolute top-5 left-5 rounded-full border border-white/35 bg-black/25 px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-white uppercase backdrop-blur-sm">
                Curated stay 01
              </div>
              <div className="absolute right-6 bottom-6 left-6 border-t border-white/35 pt-4 text-white sm:right-7 sm:bottom-7 sm:left-7">
                <p className="max-w-xs text-xs leading-5 tracking-[0.13em] uppercase">
                  {copy.hero.collectionNote}
                </p>
              </div>
            </div>
          </div>
          <div className="relative mx-auto mt-14 max-w-7xl lg:mt-20">
            <SearchPanel />
          </div>
        </section>

        <section
          className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28"
          id="collection"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-gold text-xs font-semibold tracking-[0.24em] uppercase">
                {copy.collection.eyebrow}
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {copy.collection.title}
              </h2>
              <p className="text-muted mt-4 leading-7">{copy.collection.description}</p>
            </div>
            <Link
              className="text-gold inline-flex items-center gap-2 text-sm font-medium transition hover:gap-3"
              href="/properties"
            >
              {copy.collection.viewAll} <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard key={property.slug} property={property} />
            ))}
          </div>
        </section>

        <section className="border-border bg-surface border-y" id="story">
          <div className="divide-border mx-auto grid max-w-7xl divide-y px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-10">
            {copy.values.map(([title, description], index) => (
              <div className="py-9 md:px-8 md:first:pl-0 md:last:pr-0" key={title}>
                <span className="text-gold text-xs tracking-[0.2em]">0{index + 1}</span>
                <h3 className="mt-4 text-lg font-medium">{title}</h3>
                <p className="text-muted mt-2 text-sm leading-6">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <CustomerFooter />
    </div>
  );
}
