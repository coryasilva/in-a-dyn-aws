import {
  ChangeResourceRecordSetsCommand,
  Route53Client,
  Route53ServiceException,
} from "@aws-sdk/client-route-53";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";

const sns = new SNSClient();
const r53 = new Route53Client();

const hostedZoneMap: Record<string, string> = JSON.parse(
  process.env.DDNS_R53_HOSTED_ZONE_MAP ?? "{}",
);
const blockList: string[] = JSON.parse(
  process.env.DDNS_HOSTNAME_BLOCK_LIST ?? "[]",
);
const allowList: string[] = JSON.parse(
  process.env.DDNS_HOSTNAME_ALLOW_LIST ?? "[]",
);
const mode = allowList.length > 0 ? "allow" : "block";

const snsSend = (subject: string, message: string | object) =>
  sns.send(
    new PublishCommand({
      Subject: subject,
      Message:
        typeof message === "string"
          ? message
          : JSON.stringify(message, null, 4),
      TopicArn: process.env.DDNS_SNS_TOPIC_ARN,
    }),
  );

const buildResult = (
  statusCode: number,
  body: object | string = "",
): APIGatewayProxyResult => {
  if (typeof body === "string") {
    return { statusCode, body };
  }
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  };
};

export async function handler(
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> {
  const name = event.queryStringParameters?.hostname ?? "";
  const value =
    event.queryStringParameters?.ip ?? event.requestContext.identity.sourceIp;
  const nameParts = name.split(".");
  const hostedZoneName =
    nameParts.length > 2 ? nameParts.slice(1).join(".") : name;

  console.log("Hostname", name);
  console.log("IP", value);

  if (mode === "block" && blockList.includes(name)) {
    console.log("Blocked by block list", name, blockList);
    await snsSend(`DDNS Blocked: ${name}`, {
      errorMessage: `${name} found in block list.`,
      blockList,
    });
    return buildResult(422, "Invalid hostname");
  }

  if (mode === "allow" && !allowList.includes(name)) {
    console.log("Blocked by allow list", name, allowList);
    await snsSend(`DDNS Blocked: ${name}`, {
      errorMessage: `${name} not found in allow list.`,
      allowList,
    });
    return buildResult(422, "Invalid hostname");
  }

  if (!Object.hasOwn(hostedZoneMap, hostedZoneName)) {
    console.log("Invalid zone", hostedZoneName, hostedZoneMap);
    await snsSend(`DDNS Invalid Zone: ${name}`, {
      errorMessage: `Could not find ${hostedZoneName} in map.`,
      hostedZoneMap,
    });
    return buildResult(422, "Invalid zone");
  }

  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneMap[hostedZoneName],
    ChangeBatch: {
      Comment: `DDNS: ${name} > ${value}`,
      Changes: [
        {
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: name,
            Type: "A",
            TTL: 600,
            ResourceRecords: [{ Value: value }],
          },
        },
      ],
    },
  });

  try {
    const response = await r53.send(command);
    console.log(response);
    const status = response.ChangeInfo?.Status;
    await snsSend(`DDNS ${status}: ${name} > ${value}`, { response });
    return buildResult(200, { status });
  } catch (error: unknown) {
    console.error(error);
    const message =
      error instanceof Route53ServiceException
        ? error.name
        : (error?.toString() ?? "unknown");
    await snsSend(`DDNS Error: ${name} > ${value}`, { errorMessage: message });
    throw new Error("Internal server error");
  }
}
