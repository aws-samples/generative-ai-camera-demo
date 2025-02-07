import { CfnOutput, StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration} from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import { FunctionOptions, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { UserPool, UserPoolClient} from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';
import { Bucket } from 'aws-cdk-lib/aws-s3';
export interface BffProps extends StackProps {
  table: TableV2;
  utilTable: TableV2;
  promptTable: TableV2;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  cameraBucket: Bucket;
}

export class Bff extends Construct {
  readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: BffProps) {
    super(scope, id);

    const table = props.table;
    const utilTable = props.utilTable;
    const promptTable = props.promptTable;
    const userPool = props.userPool;
    const userPoolClient = props.userPoolClient;
    const cameraBucket = props.cameraBucket;

    // API Definition
    const getCaptionFn = new NodejsFunction(this, 'getCaptionFn', {
      entry: path.join(__dirname, '../../lambda-bff/get-caption.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantReadData(getCaptionFn);

    const promptEntry = path.join(__dirname, '../../lambda-bff/prompt.ts');
    const promptEnvironment: FunctionOptions['environment'] = {
      PROMPT_TABLE_NAME: promptTable.tableName,
      UTIL_TABLE_NAME: utilTable.tableName,
    };

    const getPromptsFn = new NodejsFunction(this, 'getPromptsFn', {
      entry: promptEntry,
      handler: 'getPromptsHandler',
      runtime: Runtime.NODEJS_22_X,
      environment: promptEnvironment,
    });
    const putPromptFn = new NodejsFunction(this, 'putPromptFn', {
      entry: promptEntry,
      handler: 'putPromptHandler',
      runtime: Runtime.NODEJS_22_X,
      environment: promptEnvironment,
    });

    [getPromptsFn, putPromptFn].forEach((fn) => {
      promptTable.grantReadWriteData(fn);
      utilTable.grantReadWriteData(fn);
    });

    // WebCam Image put
    const webcamImageEntry = path.join(__dirname, '../../lambda-bff/webcam.ts');
    const webcamEnvironment: FunctionOptions['environment'] = {
      BUCKET_NAME: cameraBucket.bucketName,
    };

    const postWebcamImageFn = new NodejsFunction(this, 'putWebcamImageFn', {
      entry: webcamImageEntry,
      handler: 'putWebcamImageHandler',
      runtime: Runtime.NODEJS_22_X,
      environment: webcamEnvironment,
    });

    cameraBucket.grantWrite(postWebcamImageFn);

    // Cognito Authorizer
    const authorizer = new HttpUserPoolAuthorizer(
      'HttpAuthorizer', 
      userPool,
      {
        userPoolClients: [userPoolClient],
        identitySource: ['$request.header.Authorization']
      }
    );

    const api = new HttpApi(this, 'HttpApi', {
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: [
          CorsHttpMethod.OPTIONS,
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
        ],
        allowOrigins: ['*'],
        // 👇 optionally cache responses to preflight requests
        // maxAge: cdk.Duration.minutes(5),
      },
    });
    api.addRoutes({
      path: '/caption',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetCaptionIntegration',
        getCaptionFn
      ),
    });
    api.addRoutes({
      path: '/prompts',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetPromptsIntegration',
        getPromptsFn
      ),
    });
    api.addRoutes({
      path: '/prompt',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'PutPromptIntegration',
        putPromptFn
      ),
    });
    api.addRoutes({
      path: '/camera',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'PostWebcamImageIntegration',
        postWebcamImageFn
      ),
    });

    new CfnOutput(this, 'CfnOutputApiEndpoint', {
      value: api.apiEndpoint,
      description: 'API Endpoint',
      exportName: 'ApiEndpoint',
    });

    this.api = api;
  }
}
