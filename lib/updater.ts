import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LoggingFormat, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Subscription, SubscriptionProtocol, Topic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import type { Domain } from "./domain";
import type { DynamicDnsProps } from "./dyn-dns-stack";

export interface UpdaterProps {
  readonly domain: Domain;
  readonly subscriptionEmail: DynamicDnsProps["subscriptionEmail"];
  readonly hostnameAllowList: DynamicDnsProps["hostnameAllowList"];
  readonly hostnameBlockList: DynamicDnsProps["hostnameBlockList"];
}

export class Updater extends Construct {
  private props: UpdaterProps;
  topic: Topic;
  lambda: NodejsFunction;

  constructor(scope: Construct, id: string, props: UpdaterProps) {
    super(scope, id);
    this.props = props;
    this.topic = new Topic(this, "Topic");
    this.createSubscription();
    this.lambda = this.createLambda();

    if (this.lambda.role) {
      this.topic.grantPublish(this.lambda.role);
      this.lambda.role.addToPrincipalPolicy(
        new PolicyStatement({
          actions: ["route53:ChangeResourceRecordSets"],
          resources: this.props.domain.hostedZones.map(
            (hz) => `arn:aws:route53:::hostedzone/${hz.hostedZoneId}`,
          ),
        }),
      );
    }
  }

  private createLambda() {
    return new NodejsFunction(this, "Fn", {
      runtime: Runtime.NODEJS_22_X,
      loggingFormat: LoggingFormat.JSON,
      logGroup: new LogGroup(this, "LogGroup"),
      entry: "./lib/updater-fn.ts",
      memorySize: 256,
      environment: {
        DDNS_R53_HOSTED_ZONE_MAP: JSON.stringify(
          this.props.domain.hostedZoneMap,
        ),
        DDNS_SNS_TOPIC_ARN: this.topic.topicArn,
        DDNS_HOSTNAME_BLOCK_LIST: JSON.stringify([
          this.props.domain.domainName,
          ...(this.props.hostnameBlockList ?? []),
        ]),
        DDNS_HOSTNAME_ALLOW_LIST: JSON.stringify(
          this.props.hostnameAllowList ?? [],
        ),
      },
    });
  }

  private createSubscription() {
    new Subscription(this, "Subscription", {
      topic: this.topic,
      protocol: SubscriptionProtocol.EMAIL_JSON,
      endpoint: this.props.subscriptionEmail,
    });
  }
}
