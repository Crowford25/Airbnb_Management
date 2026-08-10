import type { Property, RoomOption } from "./content";
import { addDaysToIsoDate, differenceInNights, eachNight } from "./date-utils";

export function roomForBooking(property: Property, roomKey?: string) {
  return property.rooms.find((room) => room.roomKey === roomKey) ?? property.rooms[0];
}

export function defaultRate(room: RoomOption | undefined) {
  return room?.ratePlans.find((ratePlan) => ratePlan.isDefault) ?? room?.ratePlans[0];
}

export function requiredRooms(property: Property, adults: number, roomKey?: string) {
  if (property.stayType === "airbnb") return 1;
  const room = roomForBooking(property, roomKey);
  return Math.max(1, Math.ceil(adults / Math.max(room?.maxAdults ?? 2, 1)));
}

export function unavailableDatesForGuests(
  property: Property,
  adults: number,
  roomKey?: string,
) {
  const room = roomForBooking(property, roomKey);
  const rate = defaultRate(room);
  const rooms = requiredRooms(property, adults, roomKey);
  if (!rate) return [];

  return Object.entries(rate.inventory)
    .filter(([, day]) => day.remainingUnits < rooms)
    .map(([date]) => date);
}

export function minimumNightsForRange(
  property: Property,
  checkIn: string,
  checkOut: string,
  roomKey?: string,
) {
  const rate = defaultRate(roomForBooking(property, roomKey));
  const inventoryMinimums = eachNight(checkIn, checkOut)
    .map((date) => rate?.inventory[date]?.minimumNights)
    .filter((minimum): minimum is number => minimum !== undefined);

  return Math.max(rate?.minimumNights ?? property.minimumNights, ...inventoryMinimums);
}

function minimumCheckoutDate(property: Property, checkIn: string, roomKey?: string) {
  const rate = defaultRate(roomForBooking(property, roomKey));
  if (!rate?.inventory[checkIn]) return "";

  let minimumNights = Math.max(
    rate.minimumNights,
    rate.inventory[checkIn].minimumNights,
  );

  // A date-specific restriction later in the tentative stay may increase the
  // required length. Re-evaluate until the minimum becomes stable.
  for (let pass = 0; pass < 90; pass += 1) {
    const checkOut = addDaysToIsoDate(checkIn, minimumNights);
    const nextMinimum = minimumNightsForRange(property, checkIn, checkOut, roomKey);
    if (nextMinimum === minimumNights) return checkOut;
    minimumNights = nextMinimum;
  }

  return "";
}

export function canStartStayOn(
  property: Property,
  adults: number,
  checkIn: string,
  roomKey?: string,
) {
  const room = roomForBooking(property, roomKey);
  const rate = defaultRate(room);
  const rooms = requiredRooms(property, adults, roomKey);
  const arrivalDay = rate?.inventory[checkIn];
  const minimumCheckOut = minimumCheckoutDate(property, checkIn, roomKey);

  if (
    !rate ||
    !arrivalDay ||
    !minimumCheckOut ||
    arrivalDay.closedToArrival ||
    arrivalDay.remainingUnits < rooms
  ) {
    return false;
  }

  const stayNights = eachNight(checkIn, minimumCheckOut);
  const departureDay = rate.inventory[minimumCheckOut];
  return (
    Boolean(departureDay) &&
    !departureDay.closedToDeparture &&
    stayNights.every((date) => (rate.inventory[date]?.remainingUnits ?? 0) >= rooms)
  );
}

export function canEndStayOn(
  property: Property,
  adults: number,
  checkIn: string,
  checkOut: string,
  roomKey?: string,
) {
  const room = roomForBooking(property, roomKey);
  const rate = defaultRate(room);
  const rooms = requiredRooms(property, adults, roomKey);
  const nights = differenceInNights(checkIn, checkOut);
  const requiredMinimum = minimumNightsForRange(property, checkIn, checkOut, roomKey);

  if (
    !rate ||
    nights < requiredMinimum ||
    rate.inventory[checkIn]?.closedToArrival ||
    !rate.inventory[checkOut] ||
    rate.inventory[checkOut].closedToDeparture
  ) {
    return false;
  }

  return eachNight(checkIn, checkOut).every(
    (date) => (rate.inventory[date]?.remainingUnits ?? 0) >= rooms,
  );
}

export function staySubtotal(
  property: Property,
  adults: number,
  checkIn: string,
  checkOut: string,
  roomKey?: string,
) {
  const room = roomForBooking(property, roomKey);
  const rate = defaultRate(room);
  if (!rate) return 0;
  const nightlyRates = eachNight(checkIn, checkOut).map(
    (date) => rate.inventory[date]?.nightlyRate ?? rate.nightlyRate,
  );
  return (
    nightlyRates.reduce((sum, nightlyRate) => sum + nightlyRate, 0) *
    requiredRooms(property, adults, roomKey)
  );
}

export function canHostAdults(property: Property, adults: number) {
  return (
    adults >= 1 &&
    property.rooms.some((room) => {
      const roomCapacity =
        property.stayType === "hotel"
          ? room.maxAdults * room.inventoryCount
          : room.maxGuests;
      return adults <= roomCapacity;
    })
  );
}
