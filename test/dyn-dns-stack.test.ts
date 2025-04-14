import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { type DynamicDnsProps, DynamicDnsStack } from "../lib/dyn-dns-stack";

const props: DynamicDnsProps = {
  env: {
    account: "123456789",
    region: "us-east-1",
  },
  domainName: "myddns.domain.local",
  additionalHostedZones: ["domain2.local"],
  hostnameAllowList: [
    "mail.domain.local",
    "www.domain.local",
    "blah.domain2.local",
  ],
  subscriptionEmail: "myemail@domain.local",
};
const app = new cdk.App();
const stack = new DynamicDnsStack(app, "MyTestStack", { ...props });
const template = Template.fromStack(stack);

test("SNS Subscription", () => {
  template.hasResourceProperties("AWS::SNS::Subscription", {
    Endpoint: props.subscriptionEmail,
  });
});

test("Authorizer function env vars", () => {
  template.hasResourceProperties("AWS::Lambda::Function", {
    Environment: {
      Variables: {
        DDNS_AUTH_USERNAME: "ddnsuser",
        DDNS_AUTH_APIKEY_ID: { Ref: Match.anyValue() },
      },
    },
  });
});

test("Updater function env vars", () => {
  template.hasResourceProperties("AWS::Lambda::Function", {
    Environment: {
      Variables: {
        DDNS_R53_HOSTED_ZONE_MAP: JSON.stringify({
          "domain.local": "DUMMY",
          "domain2.local": "DUMMY",
        }),
        DDNS_SNS_TOPIC_ARN: { Ref: Match.anyValue() },
        DDNS_HOSTNAME_BLOCK_LIST: JSON.stringify([props.domainName]),
        DDNS_HOSTNAME_ALLOW_LIST: JSON.stringify(props.hostnameAllowList),
      },
    },
  });
});

test("Custom domain name", () => {
  template.hasResourceProperties("AWS::ApiGateway::DomainName", {
    DomainName: props.domainName,
  });
});

test("API method security settings", () => {
  template.hasResourceProperties("AWS::ApiGateway::Method", {
    ApiKeyRequired: true,
    AuthorizationType: "CUSTOM",
    AuthorizerId: { Ref: Match.anyValue() },
  });
});
