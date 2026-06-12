import {
  awsErrorMessage,
  consoleUrl,
  deployAuthOk,
  deployConfigured,
  deployDisabled,
  getStack,
  stackNameFor,
  whoAmI,
} from "@/lib/cfn-deploy";
import { REGION_RE } from "./schema";

export async function GET(req: Request) {
  if (deployDisabled()) return Response.json({ configured: false, disabled: true });
  if (!deployConfigured()) return Response.json({ configured: false });
  if (!deployAuthOk(req)) {
    return Response.json(
      {
        configured: true,
        passwordRequired: true,
        ...(req.headers.get("x-deploy-password") ? { error: "Wrong deploy password." } : {}),
      },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const project = url.searchParams.get("project") ?? "";
  const region = url.searchParams.get("region") ?? "us-east-1";
  if (!REGION_RE.test(region)) {
    return Response.json({ error: "Invalid region." }, { status: 400 });
  }

  try {
    const identity = await whoAmI(region);
    const stackName = stackNameFor(project);
    const stack = project ? await getStack(region, stackName) : null;
    return Response.json({
      configured: true,
      account: identity.account,
      region,
      stackName,
      stack: stack
        ? {
            exists: true,
            status: stack.StackStatus,
            consoleUrl: consoleUrl(region, stack.StackId ?? stackName),
          }
        : { exists: false },
    });
  } catch (error) {
    return Response.json({ configured: true, error: awsErrorMessage(error) }, { status: 502 });
  }
}
