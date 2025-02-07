import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Backend } from './constructs/backend';
import { Bff } from './constructs/bff';
import { Cognito } from './constructs/cognito';
import { Front } from './constructs/front';


export class GenAICameraDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const backend = new Backend(this, 'Backend', {
      bedrockModelName: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    });
    const cognito = new Cognito(this, 'Cognito', {});
    const bff = new Bff(this, 'BFF', {
      table: backend.table,
      utilTable: backend.utilTable,
      promptTable: backend.promptTable,
      userPool: cognito.userPool,
      userPoolClient: cognito.userPoolClient,
      cameraBucket: backend.cameraBucket,
    });
    new Front(this, 'Front', {
      api: bff.api,
      contentBucket: backend.contentBucket,
      userPoolId: cognito.userPool.userPoolId,
      userPoolClientId: cognito.userPoolClient.userPoolClientId,
    });
  }
}
