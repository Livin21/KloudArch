import {
  awsErrorMessage,
  deployAuthOk,
  deployConfigured,
  deployDisabled,
  executeChangeSet,
} from "@/lib/cfn-deploy";
import { isKloudarchStack, REGION_RE } from "../../schema";

export async function POST(req: Request) {
  if (deployDisabled()) {
    return Response.json({ error: "Deployments are disabled on this hosted instance." }, { status: 503 });
  }
  if (!deployConfigured()) {
    return Response.json({ error: "No AWS credentials configured." }, { status: 503 });
  }
  if (!deployAuthOk(req)) {
    return Response.json({ error: "Wrong or missing deploy password.", passwordRequired: true }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { stack, id, region } = body ?? {};
  if (!isKloudarchStack(stack ?? "") || !id || !REGION_RE.test(region ?? "")) {
    return Response.json({ error: "Invalid parameters." }, { status: 400 });
  }
  try {
    await executeChangeSet(region, stack, id);
    return Response.json({ ok: true, startedAt: Date.now() });
  } catch (error) {
    return Response.json({ error: awsErrorMessage(error) }, { status: 502 });
  }
}
