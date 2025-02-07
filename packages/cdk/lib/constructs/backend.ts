import * as cdk from 'aws-cdk-lib';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { CfnOutput, Duration, RemovalPolicy, StackProps } from 'aws-cdk-lib';
import { AttributeType, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  EventType,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';

export interface BackendProps extends StackProps {
  bedrockModelName: string;
}

export class Backend extends Construct {
  readonly table: TableV2;
  readonly utilTable: TableV2;
  readonly promptTable: TableV2;
  readonly contentBucket: Bucket;
  readonly cameraBucket: Bucket;

  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);

    const edgeImagesBucket = new Bucket(this, 'EdgeImagesBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enforceSSL: true,
    });

    const saveBucket = new Bucket(this, 'ContentBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
    });

    // create DynamoDB table to hold Rekognition results
    const table = new TableV2(this, 'Classifications', {
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY, // removes table on cdk destroy
    });

    // create DynamoDB table to hold last call time
    const utilTable = new TableV2(this, 'LambdaLastCall', {
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY, // removes table on cdk destroy
    });

    // create dynamoDB table to hold prompt tempates
    const promptTable = new TableV2(this, 'PromptTemplates', {
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY, // removes table on cdk destroy
    });

    const lambdaFunction = new PythonFunction(this, 'rekFunction', {
      functionName: 'RekFunction',
      runtime: Runtime.PYTHON_3_13,
      entry: 'lambda-backend',
      index: 'index.py',
      handler: 'main',
      environment: {
        BUCKET_NAME: edgeImagesBucket.bucketName,
        TABLE_NAME: table.tableName,
        INTERVAL_TIME: '2',
        UTIL_TABLE_NAME: utilTable.tableName,
        PROMPT_TABLE_NAME: promptTable.tableName,
        SAVE_BUCKET_NAME: saveBucket.bucketName,
        MIN_CONFIDENCE: '75',
        BEDROCK_MODEL_NAME: props.bedrockModelName,
      },
      memorySize: 512,
      timeout: Duration.seconds(120),
      tracing: Tracing.ACTIVE,
    });

    // add Rekognition permissions for Lambda function
    const statement = new PolicyStatement();
    statement.addActions(
      'rekognition:DetectLabels',
      'rekognition:DetectProtectiveEquipment',
      'bedrock:InvokeModel'
    );
    statement.addResources('*');

    // add s3 put permissions for Lambda function
    saveBucket.grantPut(lambdaFunction);

    lambdaFunction.addToRolePolicy(statement);

    // create trigger for Lambda function with image type suffixes
    edgeImagesBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(lambdaFunction),
      { suffix: '.jpg' }
    );
    edgeImagesBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(lambdaFunction),
      { suffix: '.JPG' }
    );
    edgeImagesBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(lambdaFunction),
      { suffix: '.jpeg' }
    );
    edgeImagesBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(lambdaFunction),
      { suffix: '.png' }
    );

    // grant permissions for lambda to read/write to DynamoDB table and bucket
    table.grantReadWriteData(lambdaFunction);
    utilTable.grantReadWriteData(lambdaFunction);
    promptTable.grantReadData(lambdaFunction);
    edgeImagesBucket.grantReadWrite(lambdaFunction);

    new CfnOutput(this, 'CfnOutputUploadImageToS3', {
      value: `aws s3 cp <local-path-to-image> s3://${edgeImagesBucket.bucketName}/`,
      description:
        'Upload an image to S3 (using AWS CLI) to trigger Rekognition',
    });
    new CfnOutput(this, 'CfnOutputDynamoDBTable', {
      value: table.tableName,
      description: 'This is where the image captioning results will be stored.',
    });
    new CfnOutput(this, 'CfnOutputLambdaFunction', {
      value: lambdaFunction.functionName,
    });
    new CfnOutput(this, 'CfnOutputLambdaFunctionLogs', {
      value: lambdaFunction.logGroup.logGroupName,
    });

    this.table = table;
    this.promptTable = promptTable;
    this.utilTable = utilTable;
    this.contentBucket = saveBucket;
    this.cameraBucket = edgeImagesBucket
  }
}
