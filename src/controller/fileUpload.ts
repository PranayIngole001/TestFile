import { Request, Response, Router } from 'express';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import sCode from '../common/status-codes';
import chunkDecrypter from '../common/interface/chunkDecrypter';
import { appendFile, mvZipSSH, renameFile, writeFile } from '../common/fileUpload/fileSystemHandler';
import { DatabaseSideError } from '../errors/database-side-error';
import { putToSFTP } from '../common/fileUpload/sftpHandler';
import validateSqlInjection from '../middlewares/validateSqlInjection';
import JSZip from 'jszip';
import * as fs from 'fs-extra';
// import { EOL } from 'os';

const { ok, server_error } = sCode;

const router = Router();
router.post('/file-upload',
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        const { encryptedValue, rsaEncryptedHashed, rsaEncryptedAESKey, fileName, fileExt, firstChunk, lastChunk, index, ogFileExt } = req.body;
        const { rsaDecryptedHashed, hashedValue, decryptedValue } = await chunkDecrypter({ encryptedValue, rsaEncryptedHashed, rsaEncryptedAESKey });
        if (!rsaDecryptedHashed || !hashedValue || !decryptedValue) throw new DatabaseSideError("FAILED TO DECRYPT ENCRYPTION", 500);
        if (hashedValue != rsaDecryptedHashed) throw new DatabaseSideError("INTEGRITY TEST FAILED", 500);

        (firstChunk) && await writeFile(decryptedValue.split(';base64,').pop(), `tmp_${fileName}.${fileExt}`);

        (!firstChunk) && await appendFile(decryptedValue.split(';base64,').pop(), `tmp_${fileName}.${fileExt}`);

        if (lastChunk) {
            const isFileRenamed = await renameFile(`tmp_${fileName}.${fileExt}`, `${fileName}.${fileExt}`);
            if (!isFileRenamed) throw new DatabaseSideError("Failed To Rename", 400);
            // if (fileExt == "zip" && Object.keys((await JSZip.loadAsync(await fs.readFileSync(`public/${isFileRenamed}`)))?.files ?? {})?.length != 1) throw new DatabaseSideError("ZIP FILE SHOULD CONTAINS ONLY SINGLE TEXT FILE", 500);
            const pathName = `${fileName}.${ogFileExt}`;
            return res.status(ok).send({ status: "SUCCESS", code: "SUCCESS", message: "File Uploaded Succefully", data: { lastChunk: true, fileName: pathName, pathName: `${fileName}.${fileExt}` } });
        }

        return res.status(ok).send({ status: "SUCCESS", code: "SUCCESS", message: "Chunk Uploaded Succefully", data: { nextExpectedChunk: index + 1 } });
    }
);
export { router as fileUploadRouter };