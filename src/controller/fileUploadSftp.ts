import { Request, Response, Router } from 'express';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import sCode from '../common/status-codes';
import { extractZip, mvZipSSH, removeFile } from '../common/fileUpload/fileSystemHandler';
import { DatabaseSideError } from '../errors/database-side-error';
import { putToSFTP } from '../common/fileUpload/sftpHandler';
import { execute } from '../config/db';
import JSZip from 'jszip';
import fs from "fs";
import { sDataWriter } from '../common/sDataWriter';
import { ABSOLUTE_SFTP_DIR, CLOUD_INFRA_AT, DEBUG_DB } from '../config/envConfig';
import validateSqlInjection from '../middlewares/validateSqlInjection';
import { s3Delete, s3Upload, s3UploadMultiPart } from '../common/fileUpload/s3Client';
import { bulkFiles } from '../common/bulkPrnHandler';

const { ok } = sCode;

const router = Router();
router.post('/file-upload-sftp',
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        if (!req?.currentUser) throw new DatabaseSideError("currentUser IS NULL", 400);
        const { zipOnly, method, iud_seqno, FILE_PICK_FROM_SFTP } = req.body;
        let { fileName } = req.body;

        const procType = `get_gmdb_dba_directories`;

        const sdata = sDataWriter(req, iud_seqno, `
            "a_process_seqno":"",
            "a_ref_process_seqno":"",
            "a_iud_type":"",
            "a_proc_type":"${procType}",
            "a_proc_error":"0",
            "a_db_total_records":"1000",                  
            "a_pagination_count":"0"
            `)

        const result: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`, sdata, procType, req);

        if (!result && DEBUG_DB) throw new DatabaseSideError("RESULT IS NULL", 400);

        const { data, errors, error_message, a_process_seqno, proc_type, ogData } = result;

        let { [`${procType}_detail`]: detail, } = data ?? {};
        if (!detail && !(detail?.length)) throw new DatabaseSideError("dba_directories is NULL", 400);

        let tempDir;

        switch (method) {
            case "AWSS3":
                if (fileName.split(".").pop() == "zip") fileName = await extractZip(fileName);
                if (!await s3UploadMultiPart({ fileName, filePath: `public/${fileName}`, prefix: "FVU_TEXT_IMPORT/" })) throw new DatabaseSideError("FAILED TO UPLOAD TO S3", 400);

                await execute(`SELECT rdsadmin.rdsadmin_s3_tasks.download_from_s3(p_bucket_name => 'taxcpc-staging', p_s3_prefix =>  'FVU_TEXT_IMPORT/${fileName}', p_directory_name => 'FVU_TEXT_IMPORT') AS TASK_ID FROM DUAL`, null, null, req, "queryexecute")
                // !await s3Delete({ fileName })
                tempDir = fileName;
                await removeFile(`${fileName}`);
                break;

            case "BLOB":
                const procSeq: any = `${Math.floor(Math.random() * 1000000000)}`;
                const tempName = `isl${(Math.random() + 1).toString(36).substring(2)}`;


                tempDir = FILE_PICK_FROM_SFTP && !fileName.endsWith(".zip") ? fileName : `${tempName}.txt`;

                const sftpNZip = FILE_PICK_FROM_SFTP && !fileName.endsWith(".zip");
                if (FILE_PICK_FROM_SFTP && fileName.endsWith(".zip")) {
                    console.log("inside zip statement");
                    if (await fs.existsSync(ABSOLUTE_SFTP_DIR + "/" + fileName)) {
                        await fs.copyFileSync(ABSOLUTE_SFTP_DIR + "/" + fileName, "public/" + fileName);
                    }
                }

                // console.log({ FILE_PICK_FROM_SFTP, fileName, tempDir, procSeq, final: FILE_PICK_FROM_SFTP ? fileName : tempDir }, "insertBlobQuery");
                // console.log({ FILE_PICK_FROM_SFTP, fileName, tempDir, procSeq, final: FILE_PICK_FROM_SFTP ? fileName : tempDir }, "FVU_TEXT_IMPORT");


                await execute(sftpNZip ? fileName : tempDir, procSeq, fileName, req, "insertBlobQuery");
                await execute(sftpNZip ? fileName : tempDir, procSeq, "FVU_TEXT_IMPORT", req, "transferToFolder");
                await execute(`DELETE FROM import_template_upload_file WHERE PROCESS_SEQNO=${procSeq}`, null, null, req, "queryexecute")
                await removeFile(`${fileName}`);
                break;

            default:
                await putToSFTP(`${fileName}`, detail.find((e: any) => e?.parameter_name == "FVU_TEXT_IMPORT_ZIP")?.parameter_value);
                const { status, desc, tempDir: dir }: any = await mvZipSSH(fileName, detail?.reduce((acc: any, cur: any) => {
                    acc[cur?.parameter_name] = cur?.parameter_value
                    return acc;
                }, {}), zipOnly);
                tempDir = dir;
                await removeFile(`${fileName}`);
                break;
        }
        return res.status(ok).send({ status: "SUCCES", code: "SUCCES", data: { status: "SUCCESS", tempDir } });

    }
);
export { router as fileUploadSftpRouter };