import "server-only";

import { ApiError } from "@/server/api/errors";

const zeroDecimalCurrencies = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export function toMinorUnits(amount: string | number, currency: string) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new ApiError(500, "INTERNAL_ERROR", "The payment amount is invalid.");
  }
  const multiplier = zeroDecimalCurrencies.has(currency.toUpperCase()) ? 1 : 100;
  return Math.round(numeric * multiplier);
}

export function fromMinorUnits(amount: number, currency: string) {
  const divisor = zeroDecimalCurrencies.has(currency.toUpperCase()) ? 1 : 100;
  return amount / divisor;
}
