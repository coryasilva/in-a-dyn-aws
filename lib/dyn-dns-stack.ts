import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { Api } from "./api";
import { Domain } from "./domain";
import { Updater } from "./updater";

export interface DynamicDnsProps extends StackProps {
  /** Domain name alias for API Gateway and base hosted zone to update. */
  readonly domainName: string;
  /** Names of additional hosted zones that can be updated. */
  readonly additionalHostedZones?: string[];
  /**
   * Hostnames for which updates will be blocked. The `domainName` will
   * automatically be added to this list. This will be ignored if
   * `hostnameAllowList exists.
   */
  readonly hostnameBlockList?: string[];
  /** Hostnames that will be allowed to be updated. */
  readonly hostnameAllowList?: string[];
  /** DNS Event SNS Topic subscription email. */
  readonly subscriptionEmail: string;
  /**
   * Username for basic auth HTTP call; password is generated as a part of this stack.
   * @default "ddnsuser"
   */
  readonly authUsername?: string;
  /**
   * How long API caches an authorization result; max 1 hour; set to zero to disable.
   * @default 3600
   */
  readonly authCacheTtl?: number;
}

export class DynamicDnsStack extends Stack {
  private domain: Domain;
  private updater: Updater;
  private api: Api;

  constructor(scope: Construct, id: string, props: DynamicDnsProps) {
    super(scope, id, props);

    this.domain = new Domain(this, "Domain", {
      domainName: props.domainName,
      additionalHostedZones: props.additionalHostedZones,
    });

    this.updater = new Updater(this, "Updater", {
      domain: this.domain,
      subscriptionEmail: props.subscriptionEmail,
      hostnameAllowList: props.hostnameAllowList,
      hostnameBlockList: props.hostnameBlockList,
    });

    this.api = new Api(this, "Api", {
      domain: this.domain,
      updater: this.updater,
      authUsername: props.authUsername ?? "ddnsuser",
      authCacheTtl: props.authCacheTtl ?? 60 * 60,
    });

    this.domain.createDnsRecords(this.api.restApi);

    new CfnOutput(this, "CustomUrl", {
      value: `https://${this.domain.domainName}/`,
    });
  }
}
