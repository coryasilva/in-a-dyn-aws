import type { RestApi } from "aws-cdk-lib/aws-apigateway";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  ARecord,
  type ARecordProps,
  AaaaRecord,
  type AaaaRecordProps,
  HostedZone,
  type IHostedZone,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { ApiGateway } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export interface DomainProps {
  readonly domainName: string;
  readonly additionalHostedZones?: string[];
}

export class Domain extends Construct {
  private props: DomainProps;
  hostedZone: IHostedZone;
  additionalHostedZones: IHostedZone[];
  certificate: Certificate;

  get domainName(): string {
    return this.props.domainName;
  }

  get hostedZones(): IHostedZone[] {
    return [this.hostedZone, ...this.additionalHostedZones];
  }

  get hostedZoneMap(): Record<string, string> {
    return this.additionalHostedZones.reduce(
      (result, zone) => {
        result[zone.zoneName] = zone.hostedZoneId;
        return result;
      },
      { [this.hostedZone.zoneName]: this.hostedZone.hostedZoneId },
    );
  }

  constructor(scope: Construct, id: string, props: DomainProps) {
    super(scope, id);
    this.props = props;
    this.hostedZone = this.getHostedZone();
    this.additionalHostedZones = this.getAdditionalHostedZones();
    this.certificate = this.createCertificate();
  }

  private getHostedZone() {
    const domainName = this.props.domainName.split(".").slice(1).join(".");
    return HostedZone.fromLookup(this, "HostedZone", {
      domainName,
    });
  }

  private getAdditionalHostedZones() {
    return (
      this.props.additionalHostedZones?.map((domainName, i) => {
        return HostedZone.fromLookup(this, `HostedZone${i + 1}`, {
          domainName,
        });
      }) ?? []
    );
  }

  private createCertificate() {
    return new Certificate(this, "Certificate", {
      domainName: this.props.domainName,
      validation: CertificateValidation.fromDns(this.hostedZone),
    });
  }

  createDnsRecords(restApi: RestApi) {
    const recordProps: ARecordProps & AaaaRecordProps = {
      recordName: this.props.domainName,
      zone: this.hostedZone,
      target: RecordTarget.fromAlias(new ApiGateway(restApi)),
    };

    new ARecord(this, "ARecordMain", {
      ...recordProps,
    });
    new AaaaRecord(this, "AaaaRecordMain", {
      ...recordProps,
    });
  }
}
