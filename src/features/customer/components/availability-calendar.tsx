"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import type { Property } from "../content";
import { parseIsoDate, toIsoDate } from "../date-utils";
import {
  canEndStayOn,
  canStartStayOn,
  unavailableDatesForGuests,
} from "../booking-utils";
import { useLanguage } from "../language-provider";

type AvailabilityCalendarProps = {
  checkIn: string;
  checkOut: string;
  guests: number;
  minimumDate: string;
  onSelect(date: string): void;
  property: Property;
  roomKey: string;
};

export function AvailabilityCalendar({
  checkIn,
  checkOut,
  guests,
  minimumDate,
  onSelect,
  property,
  roomKey,
}: AvailabilityCalendarProps) {
  const { copy, locale } = useLanguage();
  const firstAvailableMonth = parseIsoDate(minimumDate) ?? new Date();
  const initialDate = parseIsoDate(checkIn) ?? firstAvailableMonth;
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );
  const unavailableDates = useMemo(
    () => new Set(unavailableDatesForGuests(property, guests, roomKey)),
    [guests, property, roomKey],
  );
  const monthLabel = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-MY", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const calendarCells = [
    ...Array.from({ length: firstDay.getDay() }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) =>
        new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1),
    ),
  ];
  const canGoBack = visibleMonth > firstAvailableMonth;

  function changeMonth(amount: number) {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );
  }

  return (
    <div className="border-border bg-surface rounded-2xl border p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <button
          aria-label={copy.property.previousMonth}
          className="border-border text-muted hover:border-gold hover:text-gold grid size-10 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!canGoBack}
          onClick={() => changeMonth(-1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <p className="font-medium capitalize">{monthLabel}</p>
        <button
          aria-label={copy.property.nextMonth}
          className="border-border text-muted hover:border-gold hover:text-gold grid size-10 place-items-center rounded-full border transition"
          onClick={() => changeMonth(1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="text-muted mt-6 grid grid-cols-7 text-center text-[11px] font-semibold tracking-wider uppercase">
        {copy.property.weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {calendarCells.map((date, index) => {
          if (!date) {
            return <span aria-hidden="true" key={`empty-${index}`} />;
          }

          const isoDate = toIsoDate(date);
          const isUnavailableNight = unavailableDates.has(isoDate);
          const isPast = isoDate < minimumDate;
          const isSelected = isoDate === checkIn || isoDate === checkOut;
          const isChoosingCheckOut = Boolean(checkIn && !checkOut && isoDate > checkIn);
          const isValidCheckOut =
            isChoosingCheckOut &&
            canEndStayOn(property, guests, checkIn, isoDate, roomKey);
          const isValidCheckIn = canStartStayOn(property, guests, isoDate, roomKey);
          const isCheckOutOnly = isValidCheckOut && isUnavailableNight;
          const canSelect = isChoosingCheckOut ? isValidCheckOut : isValidCheckIn;
          const isInRange = Boolean(
            checkIn && checkOut && isoDate > checkIn && isoDate < checkOut,
          );
          const fullDate = new Intl.DateTimeFormat(
            locale === "zh-CN" ? "zh-CN" : "en-MY",
            { dateStyle: "full" },
          ).format(date);

          return (
            <button
              aria-label={`${fullDate}${
                isCheckOutOnly
                  ? `, ${copy.property.checkoutOnly}`
                  : isUnavailableNight || !canSelect
                    ? `, ${copy.property.unavailable}`
                    : ""
              }`}
              aria-pressed={isSelected}
              className={`relative grid aspect-square place-items-center rounded-lg text-sm transition ${
                isSelected
                  ? "bg-gold text-background font-semibold"
                  : isInRange
                    ? "bg-gold/15 text-gold"
                    : isCheckOutOnly
                      ? "border-gold/60 text-gold hover:bg-gold/10 border"
                      : isUnavailableNight || isPast || !canSelect
                        ? "text-muted/35 cursor-not-allowed line-through"
                        : "text-foreground hover:text-gold hover:bg-white/5"
              }`}
              disabled={isPast || !canSelect}
              key={isoDate}
              onClick={() => onSelect(isoDate)}
              type="button"
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="text-muted mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-2">
          <span className="border-border size-3 rounded-sm border" />
          {copy.property.available}
        </span>
        <span className="flex items-center gap-2">
          <span className="bg-muted/20 size-3 rounded-sm" />
          {copy.property.unavailable}
        </span>
        <span className="flex items-center gap-2">
          <span className="border-gold/60 size-3 rounded-sm border" />
          {copy.property.checkoutOnly}
        </span>
        <span className="flex items-center gap-2">
          <span className="bg-gold size-3 rounded-sm" />
          {copy.property.selected}
        </span>
      </div>
    </div>
  );
}
