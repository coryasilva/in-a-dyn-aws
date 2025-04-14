import { Duration } from "aws-cdk-lib";
import {
  AccessLogFormat,
  ApiKey,
  ApiKeySourceType,
  AuthorizationType,
  IdentitySource,
  LambdaIntegration,
  LogGroupLogDestination,
  Period,
  RequestAuthorizer,
  RequestValidator,
  RestApi,
  type UsagePlan,
} from "aws-cdk-lib/aws-apigateway";
import { LoggingFormat, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import type { Domain } from "./domain";
import type { Updater } from "./updater";

export interface ApiProps {
  readonly domain: Domain;
  readonly updater: Updater;
  readonly authUsername: string;
  readonly authCacheTtl: number;
}

export class Api extends Construct {
  private props: ApiProps;
  restApi: RestApi;
  validator: RequestValidator;
  authorizerFn: NodejsFunction;
  authorizer: RequestAuthorizer;
  usagePlan: UsagePlan;
  apiKey: ApiKey;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);
    this.props = props;
    this.restApi = this.createRestApi();
    this.validator = this.createRequestValidator();
    this.apiKey = new ApiKey(this, "ApiKey", {
      description: props.authUsername,
    });
    this.authorizerFn = this.createAuthorizerFn();
    this.authorizer = this.createAuthorizer();
    this.addRootMethod();
    this.usagePlan = this.createUsagePlan();
    this.usagePlan.addApiKey(this.apiKey);

    if (this.authorizerFn.role) {
      this.apiKey.grantRead(this.authorizerFn);
    }
  }

  private createRestApi() {
    const logGroup = new LogGroup(this, "LogGroup");
    return new RestApi(this, "RestApi", {
      description: this.props.domain.domainName,
      apiKeySourceType: ApiKeySourceType.AUTHORIZER,
      domainName: {
        domainName: this.props.domain.domainName,
        certificate: this.props.domain.certificate,
      },
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(logGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        metricsEnabled: true,
        throttlingBurstLimit: 20,
        throttlingRateLimit: 10,
      },
    });
  }

  private createRequestValidator() {
    return new RequestValidator(this, "RequestValidator", {
      validateRequestParameters: true,
      restApi: this.restApi,
    });
  }

  private createAuthorizerFn() {
    return new NodejsFunction(this, "AuthorizerFn", {
      runtime: Runtime.NODEJS_22_X,
      loggingFormat: LoggingFormat.JSON,
      logGroup: new LogGroup(this, "AuthorizerLogGroup"),
      entry: "./lib/authorizer-fn.ts",
      memorySize: 256,
      environment: {
        DDNS_AUTH_USERNAME: this.props.authUsername ?? "ddnsuser",
        DDNS_AUTH_APIKEY_ID: this.apiKey.keyId,
      },
    });
  }

  private createAuthorizer() {
    return new RequestAuthorizer(this, "Authorizer", {
      handler: this.authorizerFn,
      resultsCacheTtl: Duration.seconds(this.props.authCacheTtl),
      identitySources: [IdentitySource.context("identity.sourceIp")],
    });
  }

  private addRootMethod() {
    return this.restApi.root.addMethod(
      "GET",
      new LambdaIntegration(this.props.updater.lambda),
      {
        authorizationType: AuthorizationType.CUSTOM,
        authorizer: this.authorizer,
        apiKeyRequired: true,
        requestValidator: this.validator,
        requestParameters: {
          "method.request.querystring.ip": false,
          "method.request.querystring.hostname": true,
        },
      },
    );
  }

  private createUsagePlan() {
    return this.restApi.addUsagePlan("UsagePlan", {
      quota: {
        limit: 24,
        offset: 0,
        period: Period.DAY,
      },
      apiStages: [
        {
          stage: this.restApi.deploymentStage,
        },
      ],
    });
  }
}
