import { Request, Response, Router } from 'express';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import sCode from '../common/status-codes';
import validateSqlInjection from '../middlewares/validateSqlInjection';
import * as fs from 'fs-extra';
import { PUBLIC_BASE_PATH } from '../config/envConfig';

const { ok } = sCode;

const router = Router();
router.post('/file-upload-we',
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {

        try {
            const chunk = req?.files?.chunk;
            if (!chunk || Array.isArray(chunk)) {
                return res.status(ok).send({
                    status: "FAILED",
                    code: "0",
                    chunkstatus: { status: "Failed", chunkStatusCode: 0 },
                    message: "Chunk data is missing or invalid"
                });
            }
            !(await fs.existsSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}`)) && await fs.mkdirSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}`);
            const fileSavedFolderName = req.body?.filename.split(".").slice(0, -1).join(".");
            !(await fs.existsSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`)) && await fs.mkdirSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`);
            const filePath = `${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}/${req.body?.filename}`;
            console.log(chunk)

            if (req.body?.chunkIndex == "0") {
                try {
                    await chunk?.mv(filePath);
                } catch (error) {
                    console.log(error);
                    (await fs.existsSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`)) && await fs.promises.rm(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`, { recursive: true, force: true });
                    return res.status(ok).send({
                        status: "FAILED",
                        code: "0",
                        chunkstatus: { status: "Failed", statusCode: 0 },
                        message: "Error while writing chunk to file"
                    })
                }
            } else {
                console.log("in the non 0")
                try {
                    await chunk?.mv(filePath + `part${req.body?.chunkIndex}`);
                    await fs.appendFileSync(filePath, await fs.readFileSync(filePath + `part${req.body?.chunkIndex}`), { encoding: "binary" });
                    await fs.unlinkSync(filePath + `part${req.body?.chunkIndex}`);
                } catch (error) {
                    console.log(error);
                    console.log("in the catch block");
                    (await fs.existsSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`)) && await fs.promises.rm(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`, { recursive: true, force: true });
                    return res.status(ok).send({
                        status: "FAILED",
                        code: "0",
                        chunkstatus: { status: "Failed", statusCode: 0 },
                        message: "Error while writing chunk to file"
                    })
                }
            }
            return res.status(ok).send({
                status: "SUCCESS",
                code: "1",
                chunkstatus: { status: "SUCCESS", statusCode: 1 },
                message: "Chunk Uploaded Successfully"
            });
        } catch (err) {
            console.error(err);
            return res.status(ok).send({
                status: "FAILED",
                code: "0",
                chunkstatus: { status: "Failed", statusCode: 0 },
                message: "Error while writing chunk to file"
            });
        }
    }

);
export { router as fileUploadWE };