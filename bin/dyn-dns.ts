#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { DynamicDnsStack } from "../lib/dyn-dns-stack";

const app = new App();

new DynamicDnsStack(app, "MyDdns", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  domainName: "myddns.domain.local",
  additionalHostedZones: ["domain2.local"],
  hostnameAllowList: [
    "mail.domain.local",
    "www.domain.local",
    "blah.domain2.local",
  ],
  subscriptionEmail: "myemail@domain.local",
});
