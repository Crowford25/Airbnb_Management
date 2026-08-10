"use client";

import { CalendarDays, ChevronDown, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { nextIsoDate } from "../date-utils";
import { useLanguage } from "../language-provider";

export function SearchPanel() {
  const { copy } = useLanguage();
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [location, setLocation] = useState("");
  const [stayType, setStayType] = useState("all");
  const [guests, setGuests] = useState("2");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const searchParams = new URLSearchParams();

    for (const field of [
      "location",
      "stayType",
      "checkIn",
      "checkOut",
      "guests",
    ] as const) {
      const value = formData.get(field);

      if (typeof value === "string" && value) {
        searchParams.set(field, value);
      }
    }

    router.push(`/properties?${searchParams.toString()}`);
  }

  return (
    <form
      className="bg-surface-elevated mx-auto grid max-w-7xl gap-1 rounded-xl border border-white/10 p-2 shadow-2xl shadow-black/30 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_.8fr_auto]"
      onSubmit={handleSubmit}
    >
      <label className="group focus-within:ring-gold/70 min-w-0 rounded-lg px-4 py-3 transition focus-within:bg-white/5 focus-within:ring-1 hover:bg-white/5">
        <span className="text-gold block text-[11px] font-semibold tracking-wider uppercase">
          {copy.search.destination}
        </span>
        <input name="location" required type="hidden" value={location} />
        <SearchSelect
          ariaLabel={copy.search.destination}
          onChange={setLocation}
          options={[
            ["Kuala Lumpur", copy.filters["Kuala Lumpur"]],
            ["Penang", copy.filters.Penang],
            ["Langkawi", copy.filters.Langkawi],
          ]}
          placeholder={copy.search.destinationPlaceholder}
          value={location}
        />
      </label>
      <label className="group focus-within:ring-gold/70 min-w-0 rounded-lg px-4 py-3 transition focus-within:bg-white/5 focus-within:ring-1 hover:bg-white/5">
        <span className="text-gold block text-[11px] font-semibold tracking-wider uppercase">
          {copy.search.stayType}
        </span>
        <input name="stayType" type="hidden" value={stayType} />
        <SearchSelect
          ariaLabel={copy.search.stayType}
          onChange={setStayType}
          options={[
            ["all", copy.search.allStayTypes],
            ["hotel", copy.search.hotel],
            ["airbnb", copy.search.airbnb],
          ]}
          value={stayType}
        />
      </label>
      <label className="group focus-within:ring-gold/70 min-w-0 rounded-lg px-4 py-3 transition focus-within:bg-white/5 focus-within:ring-1 hover:bg-white/5">
        <span className="text-gold flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase">
          <CalendarDays size={13} /> {copy.search.checkIn}
        </span>
        <input
          className="text-foreground mt-1 block w-full min-w-0 bg-transparent text-sm [color-scheme:dark] outline-none"
          name="checkIn"
          onInput={(event) => {
            const value = event.currentTarget.value;
            setCheckIn(value);

            if (checkOut && checkOut <= value) {
              setCheckOut("");
            }
          }}
          type="date"
          value={checkIn}
        />
      </label>
      <label className="group focus-within:ring-gold/70 min-w-0 rounded-lg px-4 py-3 transition focus-within:bg-white/5 focus-within:ring-1 hover:bg-white/5">
        <span className="text-gold flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase">
          <CalendarDays size={13} /> {copy.search.checkOut}
        </span>
        <input
          className="text-foreground mt-1 block w-full min-w-0 bg-transparent text-sm [color-scheme:dark] outline-none"
          min={nextIsoDate(checkIn)}
          name="checkOut"
          onInput={(event) => setCheckOut(event.currentTarget.value)}
          type="date"
          value={checkOut}
        />
      </label>
      <label className="group focus-within:ring-gold/70 min-w-0 rounded-lg px-4 py-3 transition focus-within:bg-white/5 focus-within:ring-1 hover:bg-white/5">
        <span className="text-gold flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase">
          <Users size={13} /> {copy.search.guests}
        </span>
        <input name="guests" type="hidden" value={guests} />
        <SearchSelect
          ariaLabel={copy.search.guests}
          onChange={setGuests}
          options={copy.search.guestOptions.map((label, index) => [
            String(index + 1),
            label,
          ])}
          value={guests}
        />
      </label>
      <button
        className="bg-gold text-background hover:bg-gold-light flex items-center justify-center gap-2 rounded-lg px-5 py-4 text-sm font-semibold transition md:col-span-2 lg:col-span-1"
        type="submit"
      >
        <Search size={18} /> {copy.search.submit}
      </button>
    </form>
  );
}

type SearchOption = [value: string, label: string];

function SearchSelect({
  ariaLabel,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected =
    options.find(([optionValue]) => optionValue === value)?.[1] ?? placeholder;

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div className="relative mt-1" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="text-foreground flex w-full items-center justify-between gap-3 bg-transparent text-left text-sm outline-none"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={value ? "text-foreground" : "text-muted"}>{selected}</span>
        <ChevronDown
          className={`text-muted shrink-0 transition ${open ? "rotate-180" : ""}`}
          size={16}
        />
      </button>
      {open ? (
        <div
          aria-label={ariaLabel}
          className="border-border bg-surface-elevated absolute top-[calc(100%+0.65rem)] right-0 left-0 z-50 overflow-hidden rounded-lg border p-1 shadow-2xl"
          role="listbox"
        >
          {placeholder && !value ? (
            <div className="text-muted px-3 py-2 text-sm">{placeholder}</div>
          ) : null}
          {options.map(([optionValue, label]) => (
            <button
              aria-selected={optionValue === value}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm transition ${
                optionValue === value
                  ? "bg-gold/15 text-gold"
                  : "text-foreground hover:bg-white/10"
              }`}
              key={optionValue}
              onClick={() => {
                onChange(optionValue);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
