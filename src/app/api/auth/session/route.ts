import { getSession } from "@/features/auth/server/session";
import { apiJson, handleApi } from "@/server/api/response";

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const session = await getSession();
    return apiJson({ user: session?.user ?? null });
  });
}
