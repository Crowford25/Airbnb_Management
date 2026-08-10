import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { databaseQuery } from "@/server/db/query";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleApi(request, async () => {
    try {
      await databaseQuery({ text: "SELECT 1", values: [] });
    } catch {
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Database is unavailable.");
    }
    return apiJson({ status: "ok" });
  });
}
