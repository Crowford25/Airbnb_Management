import "server-only";

import type { PropertyRecord } from "@/server/db/models";

/**
 * Public property payloads expose stable booking keys and display names, never
 * database UUIDs or physical room identifiers.
 */
export function publicProperty(property: PropertyRecord) {
  return {
    ...property,
    unitTypes: property.unitTypes.map((unitType) => {
      const { id, ...room } = unitType;
      void id;
      return {
        ...room,
        ratePlans: room.ratePlans.map((record) => {
          const { id: ratePlanId, ...ratePlan } = record;
          void ratePlanId;
          return ratePlan;
        }),
      };
    }),
  };
}
