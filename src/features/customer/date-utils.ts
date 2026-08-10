const millisecondsPerDay = 86_400_000;

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function differenceInNights(checkIn: string, checkOut: string) {
  const arrival = parseIsoDate(checkIn);
  const departure = parseIsoDate(checkOut);

  if (!arrival || !departure) {
    return 0;
  }

  return Math.max(
    0,
    Math.round((departure.getTime() - arrival.getTime()) / millisecondsPerDay),
  );
}

export function nextIsoDate(value: string) {
  return addDaysToIsoDate(value, 1);
}

export function addDaysToIsoDate(value: string, days: number) {
  const date = parseIsoDate(value);

  if (!date) {
    return "";
  }

  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function hasUnavailableNight(
  checkIn: string,
  checkOut: string,
  unavailableDates: string[],
) {
  const arrival = parseIsoDate(checkIn);
  const departure = parseIsoDate(checkOut);

  if (!arrival || !departure || arrival >= departure) {
    return false;
  }

  const unavailable = new Set(unavailableDates);
  const cursor = new Date(arrival);

  while (cursor < departure) {
    if (unavailable.has(toIsoDate(cursor))) {
      return true;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return false;
}

export function eachNight(checkIn: string, checkOut: string) {
  const arrival = parseIsoDate(checkIn);
  const departure = parseIsoDate(checkOut);
  if (!arrival || !departure || arrival >= departure) return [];

  const dates: string[] = [];
  const cursor = new Date(arrival);
  while (cursor < departure) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function isValidIsoDate(value: string | undefined) {
  return Boolean(value && parseIsoDate(value));
}
