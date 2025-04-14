# In-a-Dyn AWS Route53

[In-a-Dyn](https://github.com/troglobit/inadyn) is included as a dynamic dns tool in DD-WRT, Ubiquiti UniFi, and probaly a bunch of others I am not aware of. Though AWS Route53 is not a supported provider, In-a-Dyn provides the ability to specify custom provider.

This repo sets up an AWS API Gateway with a Lambda endpoint that updates a DNS
records when it receives GET requests from your router OS running In-a-Dyn. This is usually implemented as an event based trigger which is prefered to periodic polling.

## Getting started

1. Configure your stack props in the `/bin/dyn-dns.ts` file.
2. Deploy
    ```sh
    npm install
    # Deploy the stack
    npm run cdk deploy
    # Destroy the stack
    npm run cdk destroy
    ```
3. Configure router by going to the Dynamic DNS settings and select a "custom" service provider and set the following fields.
    - **Hostname** - Enter to the DNS record you want the service to update with an A record with your WAN IP as the value.
    - **Username** - Enter `authUsername`value set in stack props; default is `ddnsuser`.
    - **Password** - Enter this value of the API Key that was created (see AWS Console > API Gateway > API Keys).
    - **Server** - Enter `domainName` value set in the stack props.

Now you should have a free private DDNS service that works with most routers.

## Architecture

>_"No kill like overkill."_

client ---> www ---> API Gateway ---> Lambda Authorizer ---> Lambda Updater ---> Route53

1. **API Gateway** is a REST API that uses a "REQUEST" authorizer with a default policy cache of 1 hour to prevent abuse, see `authCacheTtl`. The API Key is attached to a usage plan with very restricted rate limits.
2. **Lambda Authorizer** is responseble for the basic authentication check against the created API Key and provided `authUsername`.
3. **Lambda Updater** is integrated via a "Proxy Integration" and is responsible for validating the request and updating Route53. The incoming hostname is validated against against the allow or block list, and provided eligible zones.
