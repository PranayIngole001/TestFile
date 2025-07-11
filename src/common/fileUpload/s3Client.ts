import s3, { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, UploadPartCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import { AWS_ACCESSKEYID, AWS_BUCKETNAME, AWS_REGION, AWS_SECRETACCESSKEY, AWS_TEMP_URL_TIME } from "../../config/envConfig";
import { isDownloadPathExist } from "./fileSystemHandler";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolve } from "path";

const s3Client: any = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_ACCESSKEYID,
        secretAccessKey: AWS_SECRETACCESSKEY,
    },
});

export const s3Upload: any = async ({ fileName, filePath, prefix = "" }: any) => {
    return new Promise(async (res, rej) => {
        try {
            const fileStream = fs.createReadStream(filePath);
            await s3Client.send(new PutObjectCommand({
                Bucket: AWS_BUCKETNAME,
                Key: `${prefix}${fileName}`,
                Body: fileStream,
            }));
            // if (prefix) await s3Client.send(new CopyObjectCommand({
            //     Bucket: AWS_BUCKETNAME,
            //     CopySource: `/${AWS_BUCKETNAME}/${fileName}`,
            //     Key: `${prefix}${fileName}`
            // }));
            console.log("UPLOADED FROM s3Upload");

            res(true);
        } catch (error) {
            console.error('Error uploading file:', error);
            res(false);
        }
    })
}

export const s3Delete = async ({ fileName, prefix = "" }: any) => {
    return new Promise(async (res, rej) => {
        try {
            console.log({
                Bucket: AWS_BUCKETNAME,
                Key: `${prefix}${fileName}`,
            });

            console.log(await s3Client.send(new DeleteObjectCommand({
                Bucket: AWS_BUCKETNAME,
                Key: `${prefix}${fileName}`,
            })));
            res(true);
        } catch (error) {
            console.error('Error uploading file:', error);
            res(false);
        }
    })
}

export const s3Download = async ({ fileName, filePath }: any) => {
    return new Promise(async (res, rej) => {
        try {

            if (await fs.existsSync(filePath)) await fs.unlinkSync(filePath);
            await isDownloadPathExist();
            const params = {
                Bucket: AWS_BUCKETNAME,
                Key: fileName
            };
            const { Body }: any = await s3Client.send(new GetObjectCommand(params));
            const fileStream = fs.createWriteStream(filePath);
            Body.pipe(fileStream);
            fileStream.on('finish', () => {
                console.error('File downloaded successfully!');
                res(true);
            });
            fileStream.on('error', (err) => {
                console.error('Error downloading file:', err);
                res(false);
            });
        } catch (error) {
            console.error('Error uploading file:', error);
            res(false);
        }
    })
}

export const s3TempLinkGen = async (fileName: any) => new Promise(async (res, rej) => {
    try {
        const params: any = {
            Bucket: AWS_BUCKETNAME,
            Key: fileName
        };
        const getObjectCommand: any = new GetObjectCommand(params);
        const signedUrl = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: AWS_TEMP_URL_TIME ?? 10 });
        console.error(signedUrl);
        res(signedUrl);
    } catch (error) {
        console.error('Error uploading file:', error);
        res(false);
    }
})



export const s3UploadMultiPart = async ({ fileName, filePath, prefix = "" }: any) => {
    return new Promise(async (res, rej) => {
        try {
            if (fs.statSync(filePath)?.size < 6e6) return res(await s3Upload({ fileName, filePath, prefix }));
            // Initiate the multipart upload
            const createMultipartUploadParams = {
                Bucket: AWS_BUCKETNAME,
                Key: `${prefix}${fileName}`
            };
            const { UploadId } = await s3Client.send(new CreateMultipartUploadCommand(createMultipartUploadParams));

            const fileStream = fs.createReadStream(filePath, { highWaterMark: 5 * 1024 * 1024 });
            let partNumber = 0;
            const uploadParts: any = [];

            fileStream.on('data', async (chunk) => {
                partNumber++;
                console.log(partNumber)
                const uploadParams = {
                    Bucket: AWS_BUCKETNAME,
                    Key: `${prefix}${fileName}`,
                    PartNumber: partNumber,
                    UploadId: UploadId,
                    Body: chunk
                };

                // Upload each part
                uploadParts.push(s3Client.send(new UploadPartCommand(uploadParams)));
            });

            fileStream.on('error', (err) => {
                console.error('Error reading file:', err);
            });

            fileStream.on('end', async () => {
                console.log('File read stream ended');
                const uploadResponses = await Promise.all(uploadParts);

                const parts = uploadResponses.map((data, index) => ({
                    ETag: data.ETag,
                    PartNumber: index + 1
                }));

                const completeParams = {
                    Bucket: AWS_BUCKETNAME,
                    Key: `${prefix}${fileName}`,
                    MultipartUpload: {
                        Parts: parts
                    },
                    UploadId: UploadId
                };

                // Complete the multipart upload
                const completeResponse = await s3Client.send(new CompleteMultipartUploadCommand(completeParams));
                console.log('Multipart upload completed successfully:', completeResponse);
                res(true);
            });
        } catch (error) {
            console.error('Error uploading file:', error);
            res(false);
        }
    })
}