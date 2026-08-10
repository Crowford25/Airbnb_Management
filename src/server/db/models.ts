import type { AuthRole } from "@/features/auth/types";

export type PropertyType = "hotel" | "airbnb";
export type PropertyStatus = "draft" | "published" | "archived";
export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type ReservationSource =
  "direct" | "airbnb" | "booking_com" | "agoda" | "manual";
export type UnitStatus = "operational" | "maintenance" | "out_of_service" | "retired";
export type UnitBlockReason =
  "maintenance" | "owner_use" | "housekeeping" | "channel_hold" | "other";
export type ChargeCalculation =
  | "fixed_per_stay"
  | "fixed_per_night"
  | "per_unit_per_stay"
  | "per_unit_per_night"
  | "per_guest_per_night"
  | "percentage_of_accommodation";
export type ChargeType = "accommodation" | "fee" | "tax" | "discount";
export type PaymentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "requires_capture"
  | "succeeded"
  | "cancelled"
  | "failed";
export type RefundStatus =
  "pending" | "requires_action" | "succeeded" | "failed" | "cancelled";

export type DatabaseUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  role: AuthRole;
  phone: string | null;
  locale: "en" | "zh-CN";
  isActive: boolean;
  lastLoginAt: Date | null;
};

export type PropertyImage = {
  id: string;
  imageUrl: string;
  altTextEn: string;
  altTextZhCn: string | null;
  displayOrder: number;
  isCover: boolean;
};

export type PropertyAmenity = {
  code: string;
  nameEn: string;
  nameZhCn: string | null;
  category: string;
  iconKey: string | null;
};

export type CancellationRule = {
  daysBeforeCheckIn: number;
  refundPercentage: string;
};

export type CancellationPolicy = {
  code: string;
  nameEn: string;
  nameZhCn: string | null;
  descriptionEn: string | null;
  descriptionZhCn: string | null;
  noShowRefundPercentage: string;
  rules: CancellationRule[];
};

export type RatePlanRecord = {
  id: string;
  rateKey: string;
  nameEn: string;
  nameZhCn: string | null;
  baseNightlyRate: string;
  currency: string;
  minimumNights: number;
  isDefault: boolean;
  cancellationPolicy: CancellationPolicy | null;
};

export type UnitTypeRecord = {
  id: string;
  roomKey: string;
  nameEn: string;
  nameZhCn: string | null;
  descriptionEn: string | null;
  descriptionZhCn: string | null;
  maxAdults: number;
  maxChildren: number;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  inventoryCount: number;
  sortOrder: number;
  ratePlans: RatePlanRecord[];
};

export type PropertyRecord = {
  id: string;
  slug: string;
  name: string;
  nameZhCn: string | null;
  taglineEn: string | null;
  taglineZhCn: string | null;
  descriptionEn: string;
  descriptionZhCn: string | null;
  propertyType: PropertyType;
  status: PropertyStatus;
  city: string;
  stateRegion: string | null;
  countryCode: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  timezone: string;
  currency: string;
  checkInTime: string;
  checkOutTime: string;
  ratingAverage: string | null;
  reviewCount: number;
  images: PropertyImage[];
  amenities: PropertyAmenity[];
  unitTypes: UnitTypeRecord[];
};

export type InventoryDay = {
  date: string;
  remainingUnits: number;
  nightlyRate: string;
  minimumNights: number;
  closedToArrival: boolean;
  closedToDeparture: boolean;
};

export type ReservationItemRecord = {
  id: string;
  roomKey: string;
  roomName: string;
  rateKey: string | null;
  rateName: string | null;
  quantity: number;
  adults: number;
  children: number;
  averageNightlyRate: string;
  accommodationSubtotal: string;
};

export type ReservationChargeRecord = {
  id: string;
  type: ChargeType;
  code: string;
  name: string;
  calculation: ChargeCalculation;
  quantity: string;
  unitAmount: string;
  totalAmount: string;
};

export type PaymentRecord = {
  id: string;
  provider: "stripe";
  providerPaymentId: string;
  status: PaymentStatus;
  amount: number;
  amountReceived: number;
  amountRefunded: number;
  currency: string;
  paymentMethodType: string | null;
  lastErrorMessage: string | null;
  livemode: boolean;
  succeededAt: Date | null;
  createdAt: Date;
};

export type PaymentRefundRecord = {
  id: string;
  providerRefundId: string;
  status: RefundStatus;
  amount: number;
  currency: string;
  reason: string;
  failureReason: string | null;
  createdAt: Date;
};

export type ReservationRecord = {
  id: string;
  bookingReference: string;
  propertyId: string;
  propertyName: string;
  propertySlug: string;
  guestUserId: string | null;
  originRequestId: string | null;
  correlationId: string | null;
  status: ReservationStatus;
  source: ReservationSource;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  roomsCount: number;
  accommodationSubtotal: string;
  feeTotal: string;
  taxTotal: string;
  discountTotal: string;
  totalAmount: string;
  currency: string;
  holdActive: boolean;
  holdExpiresAt: Date | null;
  cancellationPolicySnapshot: Record<string, unknown>;
  createdAt: Date;
  items: ReservationItemRecord[];
  charges: ReservationChargeRecord[];
  payment: PaymentRecord | null;
  refunds: PaymentRefundRecord[];
};
