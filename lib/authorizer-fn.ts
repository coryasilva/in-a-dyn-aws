import {
  APIGatewayClient,
  GetApiKeyCommand,
} from "@aws-sdk/client-api-gateway";
import type {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEvent,
} from "aws-lambda";

const client = new APIGatewayClient();

let apiKey: string | undefined;

const getApiKey = async () => {
  const command = new GetApiKeyCommand({
    apiKey: process.env.DDNS_AUTH_APIKEY_ID,
    includeValue: true,
  });
  const response = await client.send(command);
  return response.value;
};

const buildResult = (
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string,
  apiKey?: string,
) => {
  const result: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  if (apiKey) result.usageIdentifierKey = apiKey;

  return result;
};

export async function handler(
  event: APIGatewayRequestAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> {
  const sourceIp = event.requestContext.identity.sourceIp;
  const resource = `${event.methodArn.split(event.resource)[0]}/${event.requestContext.stage}/GET/*`;
  const authHeader = event.headers?.authorization;

  /**
   * Tell API Gateway to fire a HTTP 401 Unauthorized error.
   * Normally this would be caught by the authorizer's Identity source,
   * but that is using sourceIp as a cache key and multiple keys use
   * conjunctive (and) logic which would then allow brute force attacks.
   * The authorizer cache TTL being set to 1 day should slow people down
   * plenty.
   */
  if (!authHeader) {
    throw new Error("Unauthorized");
  }

  /**
   * We use the ApiKey as the password since In-a-Dyn can only make GET
   * requests. This way we grab the apikey from the Authorization header
   * and check it before adding it to the authorizer result. Also note
   * that the apiKey value is cached in the execution context to reduce
   * the amount of SDK calls.
   */
  if (!apiKey) {
    apiKey = await getApiKey();
  }

  const username = process.env.DDNS_AUTH_USERNAME;
  const encodedCreds = authHeader.split(" ")[1];
  const [user, pass] = Buffer.from(encodedCreds, "base64")
    .toString()
    .split(":");
  const principalId = `${user}|${sourceIp}`;

  if (user === username && pass === apiKey) {
    // Include the password/apikey to leverage usage plan throttling and rate limits.
    return buildResult(principalId, "Allow", resource, pass);
  }

  // Deny by default
  return buildResult(principalId, "Deny", resource);
}
