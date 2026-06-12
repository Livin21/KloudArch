import {
  awsErrorMessage,
  consoleUrl,
  deleteStack,
  deployConfigured,
  deployDisabled,
  getStack,
  getStackEvents,
} from "@/lib/cfn-deploy";
import { isKloudarchStack, REGION_RE } from "../schema";

function guard() {
  if (deployDisabled()) {
    return Response.json({ error: "Deployments are disabled on this hosted instance." }, { status: 503 });
  }
  if (!deployConfigured()) {
    return Response.json({ error: "No AWS credentials configured." }, { status: 503 });
  }
  return null;
}

/** Poll stack status + events (after `since`) + outputs when complete. */
export async function GET(req: Request) {
  const blocked = guard();
  if (blocked) return blocked;

  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  const region = url.searchParams.get("region") ?? "";
  const since = Number(url.searchParams.get("since") ?? 0);
  if (!isKloudarchStack(name) || !REGION_RE.test(region)) {
    return Response.json({ error: "Invalid parameters." }, { status: 400 });
  }

  try {
    const stack = await getStack(region, name);
    if (!stack) {
      // Gone — the only way we get here mid-poll is a completed teardown.
      return Response.json({ status: "DELETE_COMPLETE", events: [] });
    }
    const events = await getStackEvents(region, name, since);
    const status = stack.StackStatus ?? "UNKNOWN";
    const complete = status === "CREATE_COMPLETE" || status === "UPDATE_COMPLETE";
    return Response.json({
      status,
      events,
      consoleUrl: consoleUrl(region, stack.StackId ?? name),
      ...(complete
        ? {
            outputs: (stack.Outputs ?? []).map((o) => ({
              key: o.OutputKey ?? "",
              value: o.OutputValue ?? "",
              description: o.Description ?? "",
            })),
          }
        : {}),
    });
  } catch (error) {
    return Response.json({ error: awsErrorMessage(error) }, { status: 502 });
  }
}

/** Tear down the stack. */
export async function DELETE(req: Request) {
  const blocked = guard();
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const { name, region } = body ?? {};
  if (!isKloudarchStack(name ?? "") || !REGION_RE.test(region ?? "")) {
    return Response.json({ error: "Invalid parameters." }, { status: 400 });
  }
  try {
    await deleteStack(region, name);
    return Response.json({ ok: true, startedAt: Date.now() });
  } catch (error) {
    return Response.json({ error: awsErrorMessage(error) }, { status: 502 });
  }
}
