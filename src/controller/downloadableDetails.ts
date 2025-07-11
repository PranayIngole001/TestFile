import { fileStats, writeFileAsync } from "../common/fileUpload/fileSystemHandler";
import { Request, Response, Router } from "express";
import { currentUser } from "../middlewares/current-user";
import { requireAuth } from "../middlewares/require-auth";
import sCode from "../common/status-codes";
import { execute } from "../config/db";
import { DatabaseSideError } from "../errors/database-side-error";
import { sDataWriter } from "../common/sDataWriter";
import { jsonToCsv } from "../common/xlsxOperation";
import { mltZip } from "../common/zipOperation";
import { CLOUD_INFRA_AT, DEBUG_DB, F16_GEN_PATH, FILE_CHUNK, paramsProcObj, PUBLIC_BASE_PATH, SEVEN_ZIP_PATH } from "../config/envConfig";
import { bodySanitizerValidator, sanatizeBodyFn } from "../middlewares/bodySanitizerValidator";
import validateSqlInjection from "../middlewares/validateSqlInjection";
import { s3TempLinkGen } from "../common/fileUpload/s3Client";
import * as fs from "fs";
import { exec, execSync } from 'child_process';
import { littleLegs } from "../common/delay";
import { callApi } from "./processLogSequenceCancel";
import path from "path";
const util = require('util');
const execAsync = util.promisify(exec);

const { ok } = sCode;

const router = Router();
router.post(
    "/get-file-details/:type",
    [currentUser, requireAuth],
    validateSqlInjection,
    (() => bodySanitizerValidator())(),
    async (req: Request, res: Response) => {
        if (req?.currentUser !== undefined) {
            const { type } = req.params;
            const { iud_seqno, filter, valTypeCode, process_level, valErrorCode, isSingleErr, seqNo, transform, report_heading, error_code, template_code, process_seqno, process_status_code, uploadType, iud_type, preFileName, errorTableDown, chnageFileName, a_alloc_group_str, fileExt, fileName, filePath, a_dashboard_type, tds_challan_rowid_seq, errorDesc, filterGenObj, filterGenReport, iud, fileDest, fileValue } = req.body;

            if (type == "getS3TemporaryUrl") {
                const resS3TempUrl = await s3TempLinkGen(`${filePath}/${fileName}`.replace("public/", ""));
                return res.status(ok).send({
                    status: "SUCCESS",
                    code: "SUCCESS",
                    [type]: resS3TempUrl,
                    message: `LINK ${resS3TempUrl} SUCCESSFULLY`,
                })
            };

            const filterClause = JSON.stringify([
                ...(valTypeCode ? [{
                    filter_col_field: `${isSingleErr ? "validation_error_code" : "validation_error_type_code"}`,
                    filter_col_depend_operator: `${valErrorCode ? '=' : 'in'}`,
                    filter_col_value: `${valErrorCode?.length ? valErrorCode : valTypeCode}`,
                    filter_col_field_alias: `${['cse', 'cve'].some(e => type?.split('_')?.includes(e)) ? "c." : "d."}`
                }] : req?.body?.filter ?? []),
                ...(tds_challan_rowid_seq ? [{ "filter_col_field": "tds_challan_rowid_seq", "filter_col_depend_operator": "=", "filter_col_value": tds_challan_rowid_seq, "filter_col_field_alias": "a." }] : [])

            ]);

            let errorTable = undefined;
            if (error_code) {
                errorTable = `"a_ref_process_seqno" : "${process_seqno ?? ""}",
                ${(error_code && uploadType != "bulk") ? `"a_filter_clause" : [{"filter_col_field":"validation_error_code","filter_col_depend_operator":"=","filter_col_value":"${error_code}"}],` : ""}  
                "a_template_code":"${template_code}", "a_process_status_code" : "${process_status_code}"`
            }

            let grndTtl;
            let grandRecCount;

            if (!type?.includes("grdb")) {
                const sdataForGrndt = sDataWriter(
                    req,
                    iud_seqno,
                    `
                    "a_process_seqno":"",
                    "a_proc_type":"${type?.replace("db", "dg")}",
                    "a_user_code":"${req?.currentUser?.user_code}",
                    "a_proc_error":"0",
                    "a_db_total_records":"100",
                    "a_pagination_count":"0",
                    ${process_seqno ? `"a_ref_process_seqno": "${process_seqno}",` : ""}
                    ${valErrorCode ? `"a_validation_error_code" : "${valErrorCode}"${','}` : ''}
                    ${(!error_code) ? `"a_filter_clause" : ${(filterGenObj && filterGenReport) ? JSON.stringify(sanatizeBodyFn({ body: filterGenReport, filter: filterGenObj?.advance_filter })) : (!filter ? filterClause : JSON.stringify(filter ?? []))}` : ""}
                    ${error_code ? `${errorTable}` : ""}
                `
                );

                const grndTotalresult: any = await execute(
                    `BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`,
                    sdataForGrndt,
                    type.replace("db", "dg"),
                    req
                );
                if (!grndTotalresult?.data && grndTotalresult?.error_message) throw new DatabaseSideError(grndTotalresult?.error_message, 400);
                grndTtl = grndTotalresult?.data?.[0]?.rec
                grandRecCount = grndTtl > 1e5;
            }

            // "a_process_seqno":"${process_seqno ?? ""}",

            const sdata = sDataWriter(
                req,
                iud_seqno,
                `
                "a_process_seqno":"",
                ${(!error_code && seqNo) ? `"a_ref_process_seqno":"${seqNo}",` : ""}
                "a_proc_type":"${type}",
                "a_iud_type":"${iud ?? ""}",
                "a_user_code":"${req?.currentUser?.user_code}",
                "a_proc_error":"0",
                ${(iud_type || grandRecCount) ? `"a_iud_type": "${grandRecCount ? "DOWNLOAD" : "ALL"}",` : ""}
                ${!error_code ? `"a_process_status_code": "ZA",` : ""}
                "a_db_total_records":"${grndTtl ? grndTtl : 10000000}",
                "a_pagination_count":"0",
                ${uploadType?.length ? `"a_ref_process_seqno" : "${process_seqno ?? ""}",` : ""}
                ${!error_code ? `"a_page_from":"1",                 
                "a_page_to":"1",
                "a_dashboard_type":"${a_dashboard_type ? a_dashboard_type : "DB"}",` : ""}
                ${process_level?.level ? `"a_process_level" : "${process_level?._}"${','}` : ''}
                ${valErrorCode ? `"a_validation_error_code" : "${valErrorCode}"${','}` : ''}
                ${a_alloc_group_str?.length ? ` "a_alloc_group_str": "${a_alloc_group_str}"${','}` : ''}
                ${(!error_code) ? `"a_filter_clause" : ${(filterGenObj && filterGenReport) ? JSON.stringify(sanatizeBodyFn({ body: filterGenReport, filter: filterGenObj?.advance_filter })) : (!filter ? filterClause : JSON.stringify(filter ?? []))}` : ""}
                ${error_code ? `${errorTable}` : ""}
            `
            );

            const result: any = await execute(
                `BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`,
                sdata,
                type,
                req
            );

            if (grandRecCount) throw new DatabaseSideError("Downloadable file available in download option..!", 400);

            if (!result && DEBUG_DB) throw new DatabaseSideError("RESULT IS NULL", 400);

            const {
                data,
                desc,
                errors,
                error_message,
                a_process_seqno,
                success_msg,
                proc_type,
                message,
                ogResData
            } = result;

            if (errors) {
                if (errors.length) throw new DatabaseSideError(errors, 400);
                throw new DatabaseSideError(error_message, 400);
            }

            if (!grandRecCount) {
                let {
                    [`${type}_header`]: header,
                    [`${type}_detail`]: detail,
                } = data ?? {};
                console.log(data, "data");
                console.log(result, "result");

                if (!detail) {
                    // await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed:  `RB` } });
                    throw new DatabaseSideError('Detail Not Found', 400);
                }
                if (type == "get_grdb_112") {
                    const fileTranSeq = ogResData?.a_file_tran_rowid_seq;
                    const reqClone: any = JSON.parse(JSON.stringify({
                        headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
                        body: { ...req?.body },
                        bodyClone: { "processIudType": "STATUS_UPDATE", process_seqno: result?.a_process_seqno, process_status_code, procTypeCstm: 'get_tiud_import_tran' },
                        currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
                    }));
                    await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `RA` } });

                    if (CLOUD_INFRA_AT == "AWS") {
                        try {
                            await execAsync(`umount -l /mnt/S3`);
                        } catch (error) {
                            console.log(error, "error");

                        }
                        exec(`rclone mount S3:/taxcpc-staging/form16/ /mnt/S3 --vfs-cache-mode writes`);
                        await littleLegs(3000);
                    }

                    await fs.writeFileSync(`${F16_GEN_PATH}${fileTranSeq}.txt`, detail.map((e: any) => (reqClone?.currentUser?.default_tds_type_code == "24Q")
                        ? `${e?.tanno}/${e?.deductee_panno}_20${reqClone?.currentUser?.default_acc_year.split("-").map((e: any) => parseInt(e) + 1).join("-")}.pdf${process.platform == "win32" ? "\r\n" : "\n"}${e?.tanno}/${e?.deductee_panno}_PARTB_20${reqClone?.currentUser?.default_acc_year.split("-").map((e: any) => parseInt(e) + 1).join("-")}.pdf`
                        : `${e?.tanno}/${e?.deductee_panno}_Q${reqClone?.currentUser?.default_quarter_no}_20${reqClone?.currentUser?.default_acc_year.split("-").map((e: any) => parseInt(e) + 1).join("-")}.pdf`

                    ).join(process.platform == "win32" ? "\r\n" : "\n"))


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

                    const updatedFilePath = `${replacePlaceholders(atob(fileDest), fileValue)}`.replace(`*tan_number*/`, "");

                    console.log(updatedFilePath, "updatedFilePath");
                    if (!(await fs.existsSync(`${CLOUD_INFRA_AT == "AWS" ? updatedFilePath.replace(F16_GEN_PATH, "/mnt/S3/") : updatedFilePath}`))) {
                        await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `RB` } });
                        throw new DatabaseSideError('Generation Failed', 400);
                    };

                    (async () => {

                        // 7z.exe a "C:\Users\iamsahillande\Downloads\test.zip" @"C:\Users\iamsahillande\Downloads\files.txt"

                        const cmdZip = process.platform == "win32" ? ` cd "${updatedFilePath}" && "${SEVEN_ZIP_PATH}" a ${PUBLIC_BASE_PATH}${fileTranSeq}.zip @"${F16_GEN_PATH}${fileTranSeq}.txt" -bb2 > "${F16_GEN_PATH}${fileTranSeq}.log" 2>&1` : ` cd ${CLOUD_INFRA_AT == "AWS" ? updatedFilePath.replace(F16_GEN_PATH, "/mnt/S3/") : updatedFilePath} && zip ${CLOUD_INFRA_AT == "AWS" ? "/mnt/S3/" : PUBLIC_BASE_PATH}${fileTranSeq}.zip -@ < ${F16_GEN_PATH}${fileTranSeq}.txt`;

                        console.log(cmdZip, "{SEVEN_ZIP_PATH}", { SEVEN_ZIP_PATH }, "cmdZip");

                        // const cmdZip = ` cd ${CLOUD_INFRA_AT == "AWS" ? updatedFilePath.replace(F16_GEN_PATH, "/mnt/S3/") : updatedFilePath} && zip ${CLOUD_INFRA_AT == "AWS" ? "/mnt/S3/" : PUBLIC_BASE_PATH}${fileTranSeq}.zip -@ < ${F16_GEN_PATH}${fileTranSeq}.txt`;

                        // console.log(cmdZip, "cmdZip");

                        const pathExist = await fs.existsSync(`${CLOUD_INFRA_AT == "AWS" ? updatedFilePath.replace(F16_GEN_PATH, "/mnt/S3/") : updatedFilePath}`);
                        try {
                            const { stderr, stdout } = await execAsync(cmdZip, { maxBuffer: 1024 * 1024 * 500 });
                        } catch (error) {
                            console.log(error, "errorerrorerrorerror execAsync cmdZip");
                        }

                        const fsExist = !!(await fs.existsSync(`${PUBLIC_BASE_PATH}${fileTranSeq}.zip`));
                        console.log(fsExist, "fsExist");

                        // if (fsExist) {
                        const resPdfMaker = `${fileTranSeq}.zip`;

                        const procType = "get_tiud_file_tran_fvu";
                        const sdata = sDataWriter(reqClone, iud_seqno, `
                                                        "a_iud_type":"fu",
                                                        "a_process_seqno":"",
                                                        "a_proc_type":"${procType}",
                                                        "a_proc_error":"0" ,
                                                        "a_ref_process_seqno": "${process_seqno ?? ""}",
                                                        "a_user_code":"${req?.currentUser?.user_code}",
                                                        ${false ? "" : `"file_tran":{"rowid_seq":"${fileTranSeq}","fvu_file_path":"form16","fvu_file_name":"${fsExist ? resPdfMaker : ""}"},`}
                                                        "a_process_status_code":"${fsExist ? "RC" : "RB"}"`);
                        console.log(sdata, "sdata");

                        const result: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace,iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${reqClone?.currentUser.user_code}');END;`,
                            sdata,
                            procType,
                            req
                        );

                        console.log(sdata, "sdataresult", result);

                        await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: fsExist ? "RC" : `RB` } });
                        // }


                    })();
                    throw new DatabaseSideError('Generation Start', 400);
                } else {
                    if (transform) detail = (Array.isArray(detail) ? detail : [])?.reduce((acc: any, cur: any) => {
                        acc.push({ [cur?.column_name]: cur?.column_data, ...cur })
                        return acc;
                    }, []);

                    const { default_quarter_no, default_tds_type_code, default_acc_year, client_code, entity_code, bank_branch_code } = req?.currentUser ?? {};

                    const finalFileName = `${`${entity_code ?? ""}`.toUpperCase()}_${bank_branch_code ?? ""}_${default_acc_year}_${default_tds_type_code}_Q${default_quarter_no}_${paramsProcObj?.[type] ?? report_heading}_${errorDesc ?? ""}`;

                    let zipFileName: any;
                    let iterationCount: number | null = null;
                    const fileCode = (Math.random() + 1).toString(36).substring(7);
                    const writeFileJSON = await writeFileAsync(
                        JSON.stringify(detail ?? ""),
                        `${fileCode}.txt`
                    );
                    const filesArr = [`${fileCode}.txt`];
                    zipFileName = await mltZip(filesArr);
                    const fileStat = await fileStats(`download/${zipFileName}`);
                    iterationCount = Math.ceil(fileStat?.size / FILE_CHUNK)

                    return res.status(ok).send({
                        status: "SUCCESS",
                        code: "SUCCESS",
                        [type]: {
                            header,
                            filePath: zipFileName ? `download/${zipFileName}` : "",
                            iterationCount: iterationCount ?? 0,
                            finalFileName
                        },
                        message: desc,
                    });
                }
            }
        }
    }
);
export { router as downloadFilesRouter };
