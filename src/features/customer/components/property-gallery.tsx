"use client";

import { Images } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { Property } from "../content";
import { useLanguage } from "../language-provider";

export function PropertyGallery({ property }: { property: Property }) {
  const { copy, locale } = useLanguage();
  const [activeImage, setActiveImage] = useState(0);
  const labels = property.localized[locale].galleryLabels;

  return (
    <section aria-label={copy.property.gallery}>
      <div className="border-border relative aspect-[3/2] overflow-hidden rounded-2xl border bg-black shadow-2xl shadow-black/30">
        <Image
          alt={labels[activeImage]}
          className="object-cover"
          fill
          key={property.galleryImages[activeImage]}
          priority
          quality={95}
          sizes="(min-width: 1280px) 1200px, (min-width: 1024px) calc(100vw - 80px), 100vw"
          src={property.galleryImages[activeImage]}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:gap-3">
        {property.galleryImages.map((image, index) => (
          <button
            aria-label={labels[index]}
            aria-pressed={activeImage === index}
            className={`relative aspect-[3/2] overflow-hidden rounded-lg border bg-black transition ${
              activeImage === index
                ? "border-gold ring-gold/30 ring-2"
                : "border-border hover:border-gold/60"
            }`}
            key={image}
            onClick={() => setActiveImage(index)}
            type="button"
          >
            <Image
              alt=""
              className="object-cover transition duration-300 hover:scale-[1.03]"
              fill
              quality={88}
              sizes="(min-width: 1024px) 190px, 25vw"
              src={image}
            />
            <span className="sr-only">{labels[index]}</span>
            {activeImage === index ? (
              <span className="bg-gold text-background absolute right-2 bottom-2 grid size-7 place-items-center rounded-full">
                <Images aria-hidden="true" size={14} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
