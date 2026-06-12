import { buildCloudFormationTemplate, generateCloudFormation } from "@/lib/cloudformation";
import {
  awsErrorMessage,
  createChangeSet,
  deployConfigured,
  deployDisabled,
  describeChangeSet,
  discardChangeSet,
  getStack,
  stackNameFor,
} from "@/lib/cfn-deploy";
import { isKloudarchStack, parseDesign, REGION_RE } from "../schema";

export const maxDuration = 60;

function guard() {
  if (deployDisabled()) {
    return Response.json(
      { error: "Deployments are disabled on this hosted instance. Self-host KloudArch with your own AWS credentials." },
      { status: 503 },
    );
  }
  if (!deployConfigured()) {
    return Response.json(
      { error: "No AWS credentials configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.local." },
      { status: 503 },
    );
  }
  return null;
}

/** Create a change set for the design (CREATE or UPDATE by stack existence). */
export async function POST(req: Request) {
  const blocked = guard();
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const design = parseDesign(body?.design);
  if (!design) return Response.json({ error: "Invalid design payload." }, { status: 400 });

  const template = buildCloudFormationTemplate(design);
  const resourceCount = Object.keys(template.Resources as Record<string, unknown>).length;
  if (resourceCount === 0) {
    return Response.json({ error: "Nothing deployable on the canvas." }, { status: 400 });
  }

  const stackName = stackNameFor(design.projectName);
  try {
    const existing = await getStack(design.region, stackName);
    if (existing?.StackStatus === "ROLLBACK_COMPLETE") {
      return Response.json(
        { error: "A previous first deployment failed and left the stack in ROLLBACK_COMPLETE — tear it down before deploying again." },
        { status: 409 },
      );
    }
    const changeSetType =
      existing && existing.StackStatus !== "REVIEW_IN_PROGRESS" ? "UPDATE" : "CREATE";
    const { changeSetId } = await createChangeSet(
      design.region,
      stackName,
      generateCloudFormation(design),
      changeSetType,
    );
    return Response.json({ stackName, changeSetId, changeSetType, resourceCount });
  } catch (error) {
    return Response.json({ error: awsErrorMessage(error) }, { status: 502 });
  }
}

/** Poll change-set creation status + the change list. */
export async function GET(req: Request) {
  const blocked = guard();
  if (blocked) return blocked;

  const url = new URL(req.url);
  const stack = url.searchParams.get("stack") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const region = url.searchParams.get("region") ?? "";
  if (!isKloudarchStack(stack) || !id || !REGION_RE.test(region)) {
    return Response.json({ error: "Invalid parameters." }, { status: 400 });
  }
  try {
    return Response.json(await describeChangeSet(region, stack, id));
  } catch (error) {
    return Response.json({ error: awsErrorMessage(error) }, { status: 502 });
  }
}

/** Discard a pending change set. */
export async function DELETE(req: Request) {
  const blocked = guard();
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const { stack, id, region } = body ?? {};
  if (!isKloudarchStack(stack ?? "") || !id || !REGION_RE.test(region ?? "")) {
    return Response.json({ error: "Invalid parameters." }, { status: 400 });
  }
  try {
    await discardChangeSet(region, stack, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: awsErrorMessage(error) }, { status: 502 });
  }
}
