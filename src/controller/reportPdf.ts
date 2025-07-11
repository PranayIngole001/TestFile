import { Request, Response, Router } from "express";
import { currentUser } from "../middlewares/current-user";
import { requireAuth } from "../middlewares/require-auth";
import sCode from "../common/status-codes";
// import { runQuery } from "../config/db";
import dotenv from "dotenv";
import { getFile } from "../common/fileUpload/sftpHandler";
import { DatabaseSideError } from "../errors/database-side-error";
import validateSqlInjection from "../middlewares/validateSqlInjection";
import { execute } from "../config/db";
import { CLOUD_INFRA_AT, NODE_ENV, PUBLIC_BASE_PATH } from "../config/envConfig";
import { s3Download, s3Upload } from "../common/fileUpload/s3Client";
import { littleLegs } from "../common/delay";
import * as fs from "fs";
import JSZip from "jszip";
import { writeFile } from "../common/fileUpload/fileSystemHandler";
import { pdfGeneration } from "../common/pdfHandler";
import { callApi } from "./processLogSequenceCancel";
import { sDataWriter } from "../common/sDataWriter";
import moment from "moment";
dotenv.config();
const { ok } = sCode;

const router = Router();
router.post(
    "/report-pdf-gen",
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        if (req?.currentUser !== undefined) {
            const { fileD, process_seqno, process_status_code, gd_proc_name, iud_seqno, rowid_seq, file_tran_rowid_seq, report_heading } = req.body;

            const reqClone: any = JSON.parse(JSON.stringify({
                headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
                body: { ...req?.body },
                bodyClone: { "processIudType": "STATUS_UPDATE", process_seqno, process_status_code, procTypeCstm: gd_proc_name },
                currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
            }));
            
            const MAX_SIZE = 500 * 1024; // in bytes

            if (fileD) {
                const zip = new JSZip();
                const resZip = await zip.loadAsync(await fs.readFileSync(`${NODE_ENV == "PROD" ? "public" : PUBLIC_BASE_PATH}/${fileD}`));
                const filesArr: any = Object.keys(resZip?.files);
                const compressdedFile: any = resZip.files[filesArr[0]];
                const compressdedFileSize = compressdedFile._data.uncompressedSize;
                if (compressdedFileSize > MAX_SIZE) {
                    throw new DatabaseSideError(`File ${fileD} exceeds the 500 KB size limit.`, 400);
                }
            }

            (async () => {
                await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `RD` } });
                console.log(" process_status_code_fixed: `RD` ");

                const resPdfMaker = await reportPDFMaker(fileD, { reportName: report_heading, fyYear: reqClone?.currentUser.default_acc_year, quarter: reqClone?.currentUser.default_quarter_no, tdsCode: reqClone?.currentUser.default_tds_type_code });
                console.log(resPdfMaker, " process_status_code_fixed: `RD` ");

                const procType = "get_tiud_file_tran_fvu";
                const sdata = sDataWriter(reqClone, iud_seqno, `
                        "a_iud_type":"u",
                        "a_process_seqno":"",
                        "a_proc_type":"${procType}",
                        "a_proc_error":"0" ,
                        "a_ref_process_seqno": "${process_seqno ?? ""}",
                        "a_user_code":"${req?.currentUser?.user_code}",
                        ${false ? "" : `"file_tran":{"rowid_seq":"${file_tran_rowid_seq}","fvu_file_path":"public","fvu_file_name":"${resPdfMaker}"},`}
                        "a_process_status_code":"${resPdfMaker ? "RF" : "RE"}"`);
                console.log(sdata, "sdata");

                const result: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace,iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${reqClone?.currentUser.user_code}');END;`,
                    sdata,
                    procType,
                    req
                );

                console.log(sdata, "sdataresult", result);

                await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: resPdfMaker ? "RF" : `RE` } });
            })();

            return res
                .status(ok)
                .send({
                    status: "SUCCESS",
                    code: "SUCCESS",
                    msg: "PDF Generation Start"
                });
        }
    }
);

router.post(
    "/report-sftp-push",
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        if (req?.currentUser !== undefined) {
            const { fileD, process_seqno, process_status_code, gd_proc_name, iud_seqno, rowid_seq, file_tran_rowid_seq, report_heading } = req.body;
            const reqClone: any = JSON.parse(JSON.stringify({
                headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
                body: { ...req?.body },
                bodyClone: { "processIudType": "STATUS_UPDATE", process_seqno, process_status_code, procTypeCstm: gd_proc_name },
                currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
            }));
            (async () => {
                await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `RD` } });
                console.log(" process_status_code_fixed: `RD` ");

                const resSftpPush: any = await reportSftpPush(fileD);
                console.log(resSftpPush, " process_status_code_fixed: `RD` ");

                await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: resSftpPush ? "RF" : `RE` } });
            })();
            return res
                .status(ok)
                .send({
                    status: "SUCCESS",
                    code: "SUCCESS",
                    msg: "REPORT SFTP PUSH Start"
                });
        }
    }
);

export { router as reportPDFRouter };

const getDelimiter = (content: string) => {
    content = content.split("\n").slice(0, 5).join("\n");
    return [",", ";", "\t", "\\|", ":", "\r", "\\.", "\\^", "/", "~"].reduce((a: any, c: string) => {
        const _c: any = (content.match(new RegExp(c, "g")) ?? [])?.length;
        return _c > a?._c ? { _: c.replace("\\", ""), _c } : a;
    }, { _: null, _c: 0 });
};

export const reportPDFMaker = async (filePath: any, { reportName, fyYear, quarter, tdsCode }: any) => {
    console.log("above if block");
    if (!(await fs.existsSync(`${NODE_ENV == "PROD" ? "public" : PUBLIC_BASE_PATH}/${filePath}`))) return;
    console.log("below if block");
    const zip = new JSZip();
    const resZip = await zip.loadAsync(await fs.readFileSync(`${NODE_ENV == "PROD" ? "public" : PUBLIC_BASE_PATH}/${filePath}`));
    const filesArr: any = Object.keys(resZip?.files);
    const stringBlob = await resZip.files[filesArr[0]].async("string");
    const seperator = getDelimiter(stringBlob);
    let numOfCols = 0;
    let val = stringBlob.split(/\n/g).reduce((a: any, c: any, i: any) => {
        if (c.trim()?.length < 5) return a;
        if (!i) a += `<thead >`;
        if (i && !a.includes("<tbody>")) a += `<tbody>`;
        a += `<tr style='page-break-inside:avoid; page-break-after:auto; ${!i ? "background: grey;color: #fff;" : ""}'>`;
        if (i) c.split(seperator?._).slice(0, numOfCols).forEach((e: any) => a += `<td align="${isNaN(e) ? "" : "right"}">${e} </td>`);
        else {
            c.split(seperator?._).forEach((e: any) => e && (a += `<th ${isNaN(e) ? "" : "right"}>${e} </th>`));
            numOfCols = c.split(seperator?._).filter((e: any) => e).length
        }
        a += "</tr>";
        if (!i) a += `</thead>`;
        return a;
    }, `<style>td{padding:0 .5rem;thead {display: table-header-group;display: table-row-group}</style><h1 style='text-align:center'>${reportName}</h1><table style='margin-bottom:1rem;page-break-inside:auto; border-collapse: collapse;' border='1'><tr style='background: grey;color: #fff;'><td>Generate Time</td></tr><tr><td>${moment(new Date().toLocaleString()).format("DD-MMM-yyyy")}</td></tr></table><table style='page-break-inside:auto; border-collapse: collapse;' border='1'>`);
    val += "</tbody></table>";
    console.log("below val");
    await fs.writeFileSync("public/123.html", val);
    const pdfName = await pdfGeneration(val, {
        height: "1272px", width: "1800px",
        footer: {
            height: '10mm',
            contents: {
                default:
                    '<div id="pageFooter" style="text-align: center; font-size: 12px;">Page: {{page}}/{{pages}}</div>',
            },
        },
    })
    console.log("below pdf name");
    console.log({ pdfName });
    return pdfName;
}

const reportSftpPush = async (filePath: any) => {
    console.log(filePath, "filePath");
    return true
}