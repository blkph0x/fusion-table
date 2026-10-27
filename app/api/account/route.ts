import { accountContext, accountFailure, accountHeaders } from "@/lib/auth-route";
import { assertAccountMutation, readAccountJson } from "@/lib/auth-security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { service } = await accountContext();
    return Response.json(await service.current(request), { headers: accountHeaders });
  } catch (error) { return accountFailure(error); }
}

export async function POST(request: Request) {
  try {
    const { config, service } = await accountContext();
    assertAccountMutation(request, config);
    const result = await service.action(request, await readAccountJson(request));
    return Response.json(result.body, { headers: { ...accountHeaders, ...(result.cookie ? { "Set-Cookie": result.cookie } : {}) } });
  } catch (error) { return accountFailure(error); }
}
