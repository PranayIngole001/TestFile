import { Request, Response, Router } from 'express';
import { announcementFileUpld, moveReqFileFunction } from '../common/fileHandler';
import { DatabaseSideError } from '../errors/database-side-error';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import validateSqlInjection from '../middlewares/validateSqlInjection';
import { sDataWriter } from '../common/sDataWriter';
import { CLOUD_INFRA_AT, F16_GEN_PATH, NODE_ENV, PUBLIC_BASE_PATH, SEVEN_ZIP_PATH } from '../config/envConfig';
import { execute } from '../config/db';
import * as fs from "fs";
import { runPs1 } from '../common/form16Handler';
import { exec, execSync } from 'child_process';
import { existsSync } from 'fs-extra';
import JSZip from 'jszip';
import { callApi } from './processLogSequenceCancel';
import { littleLegs } from '../common/delay';
const util = require('util');
const execAsync = util.promisify(exec);

const router = Router();

router.post('/form16-upload-add-on',
    [currentUser, requireAuth],
    async (req: Request, res: Response) => {
        const { token, fileValue, fileDest, selectedTan, replaceF16Method } = req.body;
        const { files }: any = req?.files ?? {};

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

        const updatedFilePath = `${replacePlaceholders(atob(fileDest), JSON.parse(fileValue))}`.replace(`*tan_number*`, selectedTan);


        // !(await fs.existsSync(`public/${token}`)) && await fs.mkdirSync(`public/${token}`);
        replaceF16Method && await fs.existsSync(updatedFilePath) && await fs.rmdirSync(updatedFilePath, { recursive: true });
        if (!files) throw new DatabaseSideError("FILE IS REQUIRED", 400);
        const saveRes = await moveReqFileFunction(files, `${updatedFilePath ?? token + "/"}${files.name}`, "", true);
        console.log(saveRes, files.name, "saveRes");

        if (!saveRes) throw new DatabaseSideError("FAILED TO WRITE FILE", 400);

        if (CLOUD_INFRA_AT == "AWS" && existsSync(F16_GEN_PATH) && updatedFilePath) {
            if (replaceF16Method) {
                try {
                    const cmdPurge = `rclone purge "${updatedFilePath.replace(F16_GEN_PATH, "S3:/taxcpc-staging/form16/")}"`;
                    console.log(cmdPurge, "cmdPurge");
                    const rPurge = await execAsync(cmdPurge,
                        { maxBuffer: 1024 * 1024 * 500 });
                    console.log(rPurge, "rPurge");
                } catch (error) {
                    console.log(error, "error");
                }
            }
            const cmdRc = `rclone copy "${updatedFilePath}${files.name}" "${updatedFilePath.replace(F16_GEN_PATH, "S3:/taxcpc-staging/form16/")}" -v`;
            console.log(cmdRc, "222 rclonesync");
            const rMove = await execAsync(cmdRc,
                { maxBuffer: 1024 * 1024 * 500 });
            console.log(rMove.stdout, rMove.stderr, "e/o");
            await fs.unlinkSync(`${updatedFilePath ?? token + "/"}${files.name}`)
        }
        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { fileName: saveRes, filePath: `public/webSignupUploadedFile/${saveRes}.zip` }, message: "File Uploaded Successfully..." });
    }
);


router.post('/form16-sorting-add-on',
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        const osName = process.platform == "win32" ? "W" : "L";
        const { iud_seqno, token, tanno } = req.body;

        await fs.writeFileSync(`public/${token}stat.json`, JSON.stringify({ status: "FF" }));


        // const callApisProcType = "get_tiud_f16_file_copy";

        // const sdata = sDataWriter(
        //     req,
        //     iud_seqno, ` "a_process_seqno":"", "a_proc_type":"${callApisProcType}", "a_iud_type":"i", "a_user_code":"11", "a_process_status_code":"", "a_db_total_records":"1000", "a_tanno":"${tanno ?? ""}",        "a_form_16_pdf_file_from_path":"${PUBLIC_BASE_PATH}${token}/$deductee_panno$_Q$quarter_no$_20$acc_year$.pdf", "a_os_platform":"${osName}", "a_process_log_text":"going on..." `);
        // console.log(sdata, "sdataPS1");
        // const callApisProcTypeRes = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace, : a_in_parameter_json, : a_out_parameter_json, '${req?.currentUser?.user_code}'); END; `, sdata, callApisProcType, req);
        // console.log(callApisProcTypeRes, "callApisProcTypeRes");

        // if (callApisProcTypeRes?.a_success?.[0]?.value) {
        //     (async () => {
        //         await fs.writeFileSync(`public/${token}stat.json`, JSON.stringify({ status: "FA" }));
        //         await execute(`${token}file.${osName == "W" ? "bat" : "sh"}`, callApisProcTypeRes?.a_success?.[0]?.value, "", req, "transferToApp")
        //         await runPs1({ ps1Type: `${token}file.${osName == "W" ? "bat" : "sh"}`, osName })
        //         await fs.writeFileSync(`public/${token}stat.json`, JSON.stringify({ status: "FC" }));
        //         console.log(`rclone copy "${F16_GEN_PATH}" "S3:/taxcpc-staging/form16/" -v`, "rclonesync");

        //         if (CLOUD_INFRA_AT == "AWS" && existsSync(F16_GEN_PATH)) {
        //             console.log(`rclone copy "${F16_GEN_PATH}" "S3:/taxcpc-staging/form16/" -v`, "222 rclonesync");
        //             const rMove = await execAsync(`rclone copy "${F16_GEN_PATH}" "S3:/taxcpc-staging/form16/" -v`,
        //                 { maxBuffer: 1024 * 1024 * 500 })
        //             console.log(rMove.stdout, rMove.stderr, "e/o");
        //         }
        //         await fs.writeFileSync(`public/${token}stat.json`, JSON.stringify({ status: "FF" }));
        //         await fs.rmdirSync(`public/${token}`, { recursive: true });
        //     })()
        // }

        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", message: "File Sorting Started..." });
    }
);


router.post('/form16-sorting-add-on-status',
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        const osName = process.platform == "win32" ? "W" : "L";
        const { iud_seqno, token, tanno } = req.body;

        const fileStatus = await fs.existsSync(`public/${token}stat.json`) ? await fs.readFileSync(`public/${token}stat.json`, "utf-8") : "{}";

        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", message: "File Sorting Started...", data: JSON.parse(fileStatus ?? "{}") });
    }
);


router.post('/form16-tan-list-add-on',
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        if (req?.currentUser !== undefined) {

            const { iud_seqno, fileValue, fileDest } = req.body;
            const procType = 'get_gtdb_f16_tanno';

            const sdata = sDataWriter(req, iud_seqno, `
            "a_process_seqno": "",
            "a_proc_type": "${procType}",
            "a_db_total_records": "1000",
            "a_pagination_count": "0",
            "a_page_from": "1",
            "a_page_to": "1",
            "a_process_status_code": "",
            "a_proc_error": "0",
            "a_filter_clause": []
        `);

            const result: any = await execute(
                `BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`,
                sdata,
                procType,
                req
            );

            const {
                data,
                desc,
                errors,
                error_message,
                proc_type,
            } = result;

            if (errors) {
                if (errors.length) {
                    throw new DatabaseSideError(errors, 400);
                }
                throw new DatabaseSideError(error_message, 400);
            }

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
            const fileCount: any = {};
            const tanArr = (data?.[`${procType}_detail`]?.tanno ?? []);
            if (CLOUD_INFRA_AT == "AWS") {
                try {
                    await execAsync(`umount -l /mnt/S3`);
                } catch (error) {
                    console.log(error, "error");

                }
                exec(`rclone mount S3:/taxcpc-staging/form16/ /mnt/S3 --vfs-cache-mode writes`);
                await littleLegs(3000);
            }
            for (let index = 0; index < tanArr.length; index++) {
                const tan = tanArr[index].split(" ")[0];
                let updatedFilePath = `${replacePlaceholders(atob(fileDest), fileValue)}`.replace(`*tan_number*`, tan);
                if (CLOUD_INFRA_AT == "AWS") updatedFilePath = updatedFilePath.replace(F16_GEN_PATH, "/mnt/S3/");
                console.log(updatedFilePath, "updatedFilePath");

                fileCount[tan] = await fs.existsSync(updatedFilePath) && (await fs.readdirSync(updatedFilePath))?.length
            }

            return res.status(200).send({
                status: "SUCCESS",
                code: "SUCCESS",
                [procType]: { ...data, fileCount },
                message: desc,
            });
        }
    }
);


router.post('/bulk-f16-zip-gen',
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        if (req?.currentUser !== undefined) {
            const { fileD, process_seqno, process_status_code, gd_proc_name, iud_seqno, rowid_seq, file_tran_rowid_seq, report_heading, fileDest, fileValue } = req.body;

            const reqClone: any = JSON.parse(JSON.stringify({
                headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
                body: { ...req?.body },
                bodyClone: { "processIudType": "STATUS_UPDATE", process_seqno, process_status_code, procTypeCstm: gd_proc_name },
                currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
            }));

            const fileExist = await fs.existsSync(`${NODE_ENV == "PROD" ? "public" : PUBLIC_BASE_PATH}/${fileD}`);

            await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: fileExist ? `RD` : "RE" } });

            if (fileExist) (async () => {
                console.log(" process_status_code_fixed: `RD` ");
                const zip = new JSZip();
                const resZip = await zip.loadAsync(await fs.readFileSync(`${NODE_ENV == "PROD" ? "public" : PUBLIC_BASE_PATH}/${fileD}`));
                const filesArr: any = Object.keys(resZip?.files);
                const stringBlob: any = await resZip.files[filesArr[0]].async("string");

                if (CLOUD_INFRA_AT == "AWS") {
                    try {
                        await execAsync(`umount -l /mnt/S3`);
                    } catch (error) {
                        console.log(error, "error");

                    }
                    exec(`rclone mount S3:/taxcpc-staging/form16/ /mnt/S3 --vfs-cache-mode writes`);
                    await littleLegs(3000);
                }

                await fs.writeFileSync(`${F16_GEN_PATH}${file_tran_rowid_seq}.txt`, stringBlob.split("^\n").slice(1).map((e: any) => `${e?.split("^")[0]}/${e?.split("^")[1]}_Q${reqClone?.currentUser?.default_quarter_no}_20${reqClone?.currentUser?.default_acc_year.split("-").map((e: any) => parseInt(e) + 1).join("-")}.pdf`).join("\n"))


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

                const updatedFilePath = `${replacePlaceholders(atob(fileDest), fileValue)}`.replace(`*tan_number*${process.platform == "win32" ? '\\' : '/'}`, "");

                const cmdZip = ` cd ${CLOUD_INFRA_AT == "AWS" ? updatedFilePath.replace(F16_GEN_PATH, "/mnt/S3/") : updatedFilePath} && ${process.platform == "win32" ? SEVEN_ZIP_PATH : "zip"} ${CLOUD_INFRA_AT == "AWS" ? "/mnt/S3/" : PUBLIC_BASE_PATH}${file_tran_rowid_seq}.zip -@ ${process.platform == "win32" ? "" : "< "}${F16_GEN_PATH}${file_tran_rowid_seq}.txt`;

                console.log(cmdZip, "cmdZip");

                const pathExist = await fs.existsSync(`${CLOUD_INFRA_AT == "AWS" ? updatedFilePath.replace(F16_GEN_PATH, "/mnt/S3/") : updatedFilePath}`);

                const { stderr, stdout } = await execAsync(cmdZip, { maxBuffer: 1024 * 1024 * 500 });

                const resPdfMaker = `${file_tran_rowid_seq}.zip`;

                const procType = "get_tiud_file_tran_fvu";
                const sdata = sDataWriter(reqClone, iud_seqno, `
                                "a_iud_type":"u",
                                "a_process_seqno":"",
                                "a_proc_type":"${procType}",
                                "a_proc_error":"0" ,
                                "a_ref_process_seqno": "${process_seqno ?? ""}",
                                "a_user_code":"${req?.currentUser?.user_code}",
                                ${false ? "" : `"file_tran":{"rowid_seq":"${file_tran_rowid_seq}","fvu_file_path":"public","fvu_file_name":"${resPdfMaker}"},`}
                                "a_process_status_code":"${pathExist ? "RF" : "RE"}"`);
                console.log(sdata, "sdata");

                const result: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace,iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${reqClone?.currentUser.user_code}');END;`,
                    sdata,
                    procType,
                    req
                );

                console.log(sdata, "sdataresult", result);

                await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: pathExist ? "RF" : `RE` } });
            })();
            else throw new DatabaseSideError("FILE NOT FOUND", 400);

            return res
                .status(200)
                .send({
                    status: "SUCCESS",
                    code: "SUCCESS",
                    msg: "F16 ZIP Generation Start"
                });
        }
    }
);

router.post('/form16-upload-ritms',
    [currentUser, requireAuth],
    async (req: Request, res: Response) => {
        const { token, fileValue, fileDest, selectedTan, replaceF16Method } = req.body;
        console.log({ fileValue, fileDest })
        const { files }: any = req?.files ?? {};
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
        // const updatedFilePath = `${replacePlaceholders(atob(fileDest), JSON.parse(fileValue))}`.replace(`*tan_number*`, selectedTan);
        const updatedFilePath = `${replacePlaceholders(atob(fileDest), JSON.parse(fileValue))}`;
        console.log(updatedFilePath, "updatedFilePath")
        // !(await fs.existsSync(`public/${token}`)) && await fs.mkdirSync(`public/${token}`);
        replaceF16Method && await fs.existsSync(updatedFilePath) && await fs.rmdirSync(updatedFilePath, { recursive: true });
        if (!files) throw new DatabaseSideError("FILE IS REQUIRED", 400);
        const saveRes = await moveReqFileFunction(files, `${updatedFilePath ?? token + "/"}${files.name}`, "", true);
        console.log(saveRes, files.name, "saveRes");
        if (!saveRes) throw new DatabaseSideError("FAILED TO WRITE FILE", 400);
        if (CLOUD_INFRA_AT == "AWS" && existsSync(F16_GEN_PATH) && updatedFilePath) {
            if (replaceF16Method) {
                try {
                    const cmdPurge = `rclone purge "${updatedFilePath.replace(F16_GEN_PATH, "S3:/taxcpc-staging/form16/")}"`;
                    console.log(cmdPurge, "cmdPurge");
                    const rPurge = await execAsync(cmdPurge,
                        { maxBuffer: 1024 * 1024 * 500 });
                    console.log(rPurge, "rPurge");
                } catch (error) {
                    console.log(error, "error");
                }
            }
            const cmdRc = `rclone copy "${updatedFilePath}${files.name}" "${updatedFilePath.replace(F16_GEN_PATH, "S3:/taxcpc-staging/form16/")}" -v`;
            console.log(cmdRc, "222 rclonesync");
            const rMove = await execAsync(cmdRc,
                { maxBuffer: 1024 * 1024 * 500 });
            console.log(rMove.stdout, rMove.stderr, "e/o");
            await fs.unlinkSync(`${updatedFilePath ?? token + "/"}${files.name}`)
        }
        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { fileName: saveRes, filePath: `public/webSignupUploadedFile/${saveRes}.zip` }, message: "File Uploaded Successfully..." });
    }
);

export { router as f16UploadAddOne };