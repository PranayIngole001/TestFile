import { ok } from 'assert';
import { Request, Response, Router } from 'express';
import { moveFileFunction } from '../common/fileHandler';
import { writeFileAsync } from '../common/fileUpload/fileSystemHandler';
import { DatabaseSideError } from '../errors/database-side-error';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import { validationRequest } from '../middlewares/validate-request';

const router = Router();

router.post('/upload-file-form-16',
    [currentUser, requireAuth,], validationRequest,
    async (req: Request, res: Response) => {
        if (req?.currentUser !== undefined) {
            const { pdf }: any = req?.files ?? {}
            let { fileName, filePath, fileValue, formData } = req.body;
            // if (!pdf) throw new DatabaseSideError("PDF should be uploaded", 400);
            console.log(filePath, fileValue, formData, "Req")
            const replacePlaceholders = (filePathValue: any, fileValue: any) => {
                let replacedPath = filePathValue;
                for (const key in fileValue) {
                    if (fileValue.hasOwnProperty(key)) {
                        const placeholder = key;
                        const value = fileValue[key] || '';
                        replacedPath = replacedPath.replace(new RegExp(placeholder, 'g'), value);
                    }
                }
                replacedPath = replacedPath.replace(/\$/g, '');
                replacedPath = replacedPath.replace(/\$/g, '/');
                return replacedPath;
            };


            let updatedFilePath = `${replacePlaceholders(filePath, fileValue)}`;
            console.log(updatedFilePath, "updatedFilePath")
            // const fileName = `S${(Math.random() + 1).toString(36).substring(7)}.pdf`;

            const saveRes = await moveFileFunction(formData, updatedFilePath)
            console.log(saveRes)
            if (!saveRes) throw new DatabaseSideError("FAILED TO WRITE FILE", 400);

            return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { fileName, filePath: fileName }, message: "File Uploaded Successfully..." });
        }
    }
);
export { router as UploadFileForm16 };