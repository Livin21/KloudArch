import {
  CloudFormationClient,
  CreateChangeSetCommand,
  DeleteChangeSetCommand,
  DeleteStackCommand,
  DescribeChangeSetCommand,
  DescribeStackEventsCommand,
  DescribeStacksCommand,
  ExecuteChangeSetCommand,
  type Stack,
} from "@aws-sdk/client-cloudformation";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { timingSafeEqual } from "node:crypto";

/**
 * Server-only deploy engine: thin wrapper around the CloudFormation SDK.
 * Credentials come from the environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 * via the SDK default chain); the region comes from the design, per request.
 */

const TEMPLATE_BODY_LIMIT = 51_200;

export function deployDisabled(): boolean {
  const v = process.env.DEPLOY_DISABLED?.toLowerCase();
  return v === "1" || v === "true";
}

export function deployConfigured(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export function deployPasswordRequired(): boolean {
  return Boolean(process.env.DEPLOY_PASSWORD);
}

/** Timing-safe check of the optional shared deploy secret. */
export function deployAuthOk(req: Request): boolean {
  const expected = process.env.DEPLOY_PASSWORD;
  if (!expected) return true;
  const given = req.headers.get("x-deploy-password") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function stackNameFor(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `kloudarch-${slug || "design"}`;
}

function cfn(region: string) {
  return new CloudFormationClient({ region });
}

/** Normalize AWS SDK errors to a user-facing message. */
export function awsErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { name?: string; message?: string };
    if (e.message) return e.name ? `${e.name}: ${e.message}` : e.message;
  }
  return "AWS request failed.";
}

export async function whoAmI(region: string): Promise<{ account: string; arn: string }> {
  const sts = new STSClient({ region });
  const res = await sts.send(new GetCallerIdentityCommand({}));
  return { account: res.Account ?? "unknown", arn: res.Arn ?? "" };
}

export async function getStack(region: string, stackName: string): Promise<Stack | null> {
  try {
    const res = await cfn(region).send(new DescribeStacksCommand({ StackName: stackName }));
    return res.Stacks?.[0] ?? null;
  } catch (error) {
    // "Stack ... does not exist" arrives as a ValidationError.
    if (awsErrorMessage(error).includes("does not exist")) return null;
    throw error;
  }
}

export async function createChangeSet(
  region: string,
  stackName: string,
  templateBody: string,
  changeSetType: "CREATE" | "UPDATE",
): Promise<{ changeSetId: string }> {
  if (Buffer.byteLength(templateBody, "utf8") > TEMPLATE_BODY_LIMIT) {
    throw new Error(
      `Template is ${Buffer.byteLength(templateBody, "utf8")} bytes — CloudFormation's direct limit is ${TEMPLATE_BODY_LIMIT}. Split the design or deploy it via the exported template and S3.`,
    );
  }
  const res = await cfn(region).send(
    new CreateChangeSetCommand({
      StackName: stackName,
      ChangeSetName: `kloudarch-${Date.now()}`,
      ChangeSetType: changeSetType,
      TemplateBody: templateBody,
      Capabilities: ["CAPABILITY_IAM"],
      Description: "Created by KloudArch Studio",
    }),
  );
  return { changeSetId: res.Id ?? "" };
}

export type ChangeSetStatus = {
  status: string;
  reason?: string;
  /** True when creation failed only because the template matches the stack. */
  noChanges: boolean;
  changes: { action: string; logicalId: string; resourceType: string; replacement?: string }[];
};

export async function describeChangeSet(
  region: string,
  stackName: string,
  changeSetId: string,
): Promise<ChangeSetStatus> {
  const res = await cfn(region).send(
    new DescribeChangeSetCommand({ StackName: stackName, ChangeSetName: changeSetId }),
  );
  const reason = res.StatusReason ?? "";
  return {
    status: res.Status ?? "UNKNOWN",
    reason: res.StatusReason,
    noChanges:
      res.Status === "FAILED" &&
      (reason.includes("didn't contain changes") || reason.includes("No updates are to be performed")),
    changes: (res.Changes ?? []).map((c) => ({
      action: c.ResourceChange?.Action ?? "Unknown",
      logicalId: c.ResourceChange?.LogicalResourceId ?? "?",
      resourceType: c.ResourceChange?.ResourceType ?? "?",
      replacement: c.ResourceChange?.Replacement,
    })),
  };
}

export async function executeChangeSet(region: string, stackName: string, changeSetId: string) {
  await cfn(region).send(
    new ExecuteChangeSetCommand({ StackName: stackName, ChangeSetName: changeSetId }),
  );
}

export async function discardChangeSet(region: string, stackName: string, changeSetId: string) {
  await cfn(region).send(
    new DeleteChangeSetCommand({ StackName: stackName, ChangeSetName: changeSetId }),
  );
}

export async function deleteStack(region: string, stackName: string) {
  await cfn(region).send(new DeleteStackCommand({ StackName: stackName }));
}

export type StackEvent = {
  at: number;
  logicalId: string;
  resourceType: string;
  status: string;
  reason?: string;
};

export async function getStackEvents(
  region: string,
  stackName: string,
  since: number,
): Promise<StackEvent[]> {
  const res = await cfn(region).send(new DescribeStackEventsCommand({ StackName: stackName }));
  return (res.StackEvents ?? [])
    .map((e) => ({
      at: e.Timestamp?.getTime() ?? 0,
      logicalId: e.LogicalResourceId ?? "?",
      resourceType: e.ResourceType ?? "?",
      status: e.ResourceStatus ?? "?",
      reason: e.ResourceStatusReason,
    }))
    .filter((e) => e.at > since)
    .sort((a, b) => a.at - b.at);
}

export function consoleUrl(region: string, stackId: string): string {
  return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/stackinfo?stackId=${encodeURIComponent(stackId)}`;
}
