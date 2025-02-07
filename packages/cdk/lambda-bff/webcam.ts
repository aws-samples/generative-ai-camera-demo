// lambda/index.mjs
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const putWebcamImageHandler = async (event) => {
  try {

    console.log('Event headers:', JSON.stringify(event.headers, null, 2));
    console.log('Event body:', event.body);
    console.log('Is Base64 Encoded:', event.isBase64Encoded);

    const { image, inFileName } = JSON.parse(event.body);

    if (!image) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Image data is missing' })
        };
    }

    const imageBuffer = Buffer.from(image, 'base64');
   
    // 現在の日時を取得し、ファイル名の一部として使用
    const now = new Date();
    const dateTimeString = now.toISOString().replace(/[-:]/g, '').split('.')[0]; // YYYYMMDDTHHmmss 形式
    const fileName = `${dateTimeString}_${randomUUID()}.jpg`;

    const contentType = 'image/jpeg';

    const command = new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: fileName,
      Body:  imageBuffer,
      ContentType: contentType
    });

    await s3Client.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Image uploaded successfully', fileName: fileName }),
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error uploading file' }),
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    };
  }
};
