import { accountContext, accountFailure, accountHeaders } from "@/lib/auth-route";
import { AccountError, assertAccountMutation, MAX_ACCOUNT_STATE_BYTES, readAccountJson } from "@/lib/auth-security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { service } = await accountContext();
    return Response.json(await service.readState(request), { headers: accountHeaders });
  } catch (error) { return accountFailure(error); }
}

export async function PUT(request: Request) {
  try {
    const { config, service } = await accountContext();
    assertAccountMutation(request, config);
    // Reject anonymous uploads before reading a multi-megabyte kitchen. The
    // service rechecks identity after reading, covering mid-upload revocation.
    if (!await service.identity(request)) throw new AccountError("Sign in before syncing your kitchen.", 401);
    const result = await service.writeState(request, await readAccountJson(request, MAX_ACCOUNT_STATE_BYTES + 256));
    return Response.json(result.saved ? { state: result.state } : { error: "Your saved kitchen changed in another tab or device. Choose which version to keep.", state: result.state }, { status: result.saved ? 200 : 409, headers: accountHeaders });
  } catch (error) { return accountFailure(error); }
}
