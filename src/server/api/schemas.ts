import "server-only";

import { z } from "zod";

import { authRoles } from "@/features/auth/types";

import { emailSchema, isoDateSchema } from "./validation";

const nullableShortText = z.string().trim().max(300).nullable().optional();
const moneySchema = z.number().finite().min(0).max(10_000_000);
const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const imageSchema = z
  .object({
    altTextEn: z.string().trim().min(1).max(300),
    altTextZhCn: z.string().trim().max(300).nullable().optional(),
    imageUrl: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .refine(
        (value) => value.startsWith("/") || URL.canParse(value),
        "Enter an absolute site path or URL.",
      ),
  })
  .strict();

const propertyWriteObjectSchema = z
  .object({
    addressLine1: z.string().trim().max(240).nullable().optional(),
    addressLine2: z.string().trim().max(240).nullable().optional(),
    amenityCodes: z.array(z.string().trim().min(1).max(80)).max(50),
    checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    city: z.string().trim().min(1).max(120),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase()),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    descriptionEn: z.string().trim().min(20).max(10_000),
    descriptionZhCn: z.string().trim().max(10_000).nullable().optional(),
    images: z.array(imageSchema).min(1).max(12),
    name: z.string().trim().min(2).max(180),
    nameZhCn: z.string().trim().max(180).nullable().optional(),
    postalCode: z.string().trim().max(20).nullable().optional(),
    propertyType: z.enum(["hotel", "airbnb"]),
    slug: slugSchema,
    stateRegion: z.string().trim().max(120).nullable().optional(),
    status: z.enum(["draft", "published", "archived"]),
    taglineEn: nullableShortText,
    taglineZhCn: nullableShortText,
    timezone: z.string().trim().min(1).max(80),
  })
  .strict();

const unitSchema = z
  .object({
    floorLabel: z.string().trim().max(80).nullable().optional(),
    internalCode: z.string().trim().min(1).max(100),
    internalName: z.string().trim().max(180).nullable().optional(),
    status: z
      .enum(["operational", "maintenance", "out_of_service", "retired"])
      .default("operational"),
  })
  .strict();

const ratePlanSchema = z
  .object({
    baseNightlyRate: moneySchema,
    cancellationPolicyCode: codeSchema,
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    isDefault: z.boolean(),
    minimumNights: z.number().int().min(1).max(90),
    nameEn: z.string().trim().min(1).max(180),
    nameZhCn: z.string().trim().max(180).nullable().optional(),
    rateKey: codeSchema,
  })
  .strict();

const unitTypeSchema = z
  .object({
    bathrooms: z.number().finite().min(0).max(100),
    bedrooms: z.number().int().min(0).max(100),
    beds: z.number().int().min(0).max(200),
    descriptionEn: z.string().trim().max(10_000).nullable().optional(),
    descriptionZhCn: z.string().trim().max(10_000).nullable().optional(),
    maxAdults: z.number().int().min(1).max(100),
    maxChildren: z.number().int().min(0).max(100),
    maxGuests: z.number().int().min(1).max(200),
    nameEn: z.string().trim().min(1).max(180),
    nameZhCn: z.string().trim().max(180).nullable().optional(),
    ratePlans: z.array(ratePlanSchema).min(1).max(20),
    roomKey: codeSchema,
    units: z.array(unitSchema).min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.maxGuests < value.maxAdults) {
      context.addIssue({
        code: "custom",
        message: "Maximum guests cannot be lower than maximum adults.",
        path: ["maxGuests"],
      });
    }

    if (value.ratePlans.filter((ratePlan) => ratePlan.isDefault).length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Each room type must have exactly one default rate plan.",
        path: ["ratePlans"],
      });
    }

    const rateKeys = value.ratePlans.map((ratePlan) => ratePlan.rateKey);
    if (new Set(rateKeys).size !== rateKeys.length) {
      context.addIssue({
        code: "custom",
        message: "Rate plan keys must be unique within a room type.",
        path: ["ratePlans"],
      });
    }

    const unitCodes = value.units.map((unit) => unit.internalCode);
    if (new Set(unitCodes).size !== unitCodes.length) {
      context.addIssue({
        code: "custom",
        message: "Internal room codes must be unique within a room type.",
        path: ["units"],
      });
    }
  });

function validatePropertyRelations(
  value: {
    amenityCodes: string[];
    propertyType: "hotel" | "airbnb";
    unitTypes: z.infer<typeof unitTypeSchema>[];
  },
  context: z.RefinementCtx,
) {
  if (new Set(value.amenityCodes).size !== value.amenityCodes.length) {
    context.addIssue({
      code: "custom",
      message: "Amenity codes must be unique.",
      path: ["amenityCodes"],
    });
  }

  const roomKeys = value.unitTypes.map((unitType) => unitType.roomKey);
  if (new Set(roomKeys).size !== roomKeys.length) {
    context.addIssue({
      code: "custom",
      message: "Room keys must be unique within a property.",
      path: ["unitTypes"],
    });
  }

  if (
    value.propertyType === "airbnb" &&
    (value.unitTypes.length !== 1 || value.unitTypes[0]?.units.length !== 1)
  ) {
    context.addIssue({
      code: "custom",
      message: "An Airbnb listing must have one whole-property room type and one unit.",
      path: ["unitTypes"],
    });
  }
}

export const propertyCreateSchema = propertyWriteObjectSchema
  .extend({ unitTypes: z.array(unitTypeSchema).min(1).max(50) })
  .superRefine(validatePropertyRelations);

export const propertyWriteSchema = propertyWriteObjectSchema.superRefine(
  (value, context) => {
    if (new Set(value.amenityCodes).size !== value.amenityCodes.length) {
      context.addIssue({
        code: "custom",
        message: "Amenity codes must be unique.",
        path: ["amenityCodes"],
      });
    }
  },
);

export const propertyPatchSchema = propertyWriteObjectSchema.partial().strict();

export const createReservationSchema = z
  .object({
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    idempotencyKey: z.string().trim().min(8).max(80),
    items: z
      .array(
        z
          .object({
            adults: z.number().int().min(1).max(100),
            children: z.number().int().min(0).max(100).default(0),
            quantity: z.number().int().min(1).max(50),
            rateKey: codeSchema.optional(),
            roomKey: codeSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    propertySlug: slugSchema,
    specialRequests: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.checkOut <= value.checkIn) {
      context.addIssue({
        code: "custom",
        message: "Check-out must be after check-in.",
        path: ["checkOut"],
      });
    }

    const itemKeys = value.items.map(
      (item) => `${item.roomKey}:${item.rateKey ?? "default"}`,
    );
    if (new Set(itemKeys).size !== itemKeys.length) {
      context.addIssue({
        code: "custom",
        message: "Combine duplicate room and rate selections into one item.",
        path: ["items"],
      });
    }
  });

export const roomStatusUpdateSchema = z
  .object({
    status: z.enum(["operational", "maintenance", "out_of_service", "retired"]),
  })
  .strict();

export const roomBlockCreateSchema = z
  .object({
    endDate: isoDateSchema,
    externalReference: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
    reason: z.enum([
      "maintenance",
      "owner_use",
      "housekeeping",
      "channel_hold",
      "other",
    ]),
    startDate: isoDateSchema,
    unitId: z.string().uuid(),
  })
  .strict()
  .refine((value) => value.endDate > value.startDate, {
    message: "End date must be after start date.",
    path: ["endDate"],
  });

export const reservationStatusUpdateSchema = z
  .object({
    cancellationReason: z.string().trim().max(1_000).nullable().optional(),
    status: z.enum(["confirmed", "cancelled", "completed"]),
  })
  .strict();

export const paymentRefundCreateSchema = z
  .object({
    amount: z.number().finite().positive().max(10_000_000).optional(),
    idempotencyKey: z.string().trim().min(8).max(80),
    reason: z.string().trim().min(3).max(1_000),
  })
  .strict();

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(160),
    locale: z.enum(["en", "zh-CN"]),
    phone: z.string().trim().max(40).nullable(),
  })
  .strict();

export const userAccessUpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(authRoles).optional(),
  })
  .strict()
  .refine((value) => value.isActive !== undefined || value.role !== undefined, {
    message: "Provide a role or active status to update.",
  });

export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(1_000) })
  .strict();
