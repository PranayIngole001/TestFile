import express, { Request, Response, Router } from 'express';
// import ExcelJS from 'exceljs';
import fs from 'fs';
import sCode from '../common/status-codes';
import JSZip, { file } from "jszip";
import { NODE_ENV, PUBLIC_BASE_PATH } from '../config/envConfig';
import { callApi } from './processLogSequenceCancel';
import { sDataWriter } from '../common/sDataWriter';
import { execute } from '../config/db';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import validateSqlInjection from '../middlewares/validateSqlInjection';
const { ok } = sCode;
import { Workbook, Format, FormatBorder, Color } from "wasm-xlsxwriter";

const app = express();
const router = Router();

router.post('/report-excel-gen',
    [currentUser, requireAuth],
    validateSqlInjection,
    async (req: Request, res: Response) => {
        const { fileD, process_seqno, process_status_code, gd_proc_name, iud_seqno, rowid_seq, file_tran_rowid_seq, report_heading } = req.body;


        // const fileOutput = await excelGenerator({ filePath: fileD, filename: "abc" })
        // console.log(fileOutput, "****************r");
        console.log(fileD, "fileDfileDfileD");
        const reqClone: any = JSON.parse(JSON.stringify({
            headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
            body: { ...req?.body },
            bodyClone: { "processIudType": "STATUS_UPDATE", process_seqno, process_status_code, procTypeCstm: gd_proc_name },
            currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
        }));

        (async () => {
            await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `RD` } });
            // console.log(" process_status_code_fixed: `RD` ");
            const fileName = (Math.random() + 1).toString(36).substring(7);
            const fileOutput = await excelGenerator({ filePath: fileD, finalFileName: fileName })
            // const fileOutput = await excelGenerator({ filePath: '49371339.zip', finalFileName: fileName })
            // const fileOutput = await excelGenerator({ filePath: '95014956.zip', finalFileName: fileName })

            console.log({ fileOutput });
            // return;



            const procType = "get_tiud_file_tran_fvu";
            const sdata = sDataWriter(reqClone, iud_seqno, `
                                    "a_iud_type":"u",
                                    "a_process_seqno":"",
                                    "a_proc_type":"${procType}",
                                    "a_proc_error":"0" ,
                                    "a_ref_process_seqno": "${process_seqno ?? ""}",
                                    "a_user_code":"${req?.currentUser?.user_code}",
                                    ${false ? "" : `"file_tran":{"rowid_seq":"","fvu_file_path":"public","fvu_file_name":"${fileOutput}"},`}
                                    "a_process_status_code":"${fileOutput ? "RF" : "RE"}"`);
            console.log(sdata, "sdatabbbbbbbbbbbbb");

            const result: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace,iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${reqClone?.currentUser.user_code}');END;`,
                sdata,
                procType,
                req
            );

            console.log(sdata, "sdata", result);

            await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: fileOutput ? "RF" : `RE` } });
        })();
        return res
            .status(ok)
            .send({
                status: "SUCCESS",
                code: "SUCCESS",
                msg: "Excel Generation Start"
            });

    }
)

export { router as reportExcelRouter }

const getDelimiter = (content: string) => {
    content = content.split("\n").slice(0, 5).join("\n");
    return [",", ";", "\t", "\\|", ":", "\r", "\\.", "\\^", "/", "~"].reduce((a: any, c: string) => {
        const _c: any = (content.match(new RegExp(c, "g")) ?? [])?.length;
        return _c > a?._c ? { _: c.replace("\\", ""), _c } : a;
    }, { _: null, _c: 0 });
};


export const excelGenerator = async ({ filePath, finalFileName }: any) => {

    console.log({ filePath });
    if (!(await fs.existsSync(`${NODE_ENV == "PROD" ? "public" : PUBLIC_BASE_PATH}/${filePath}`))) return;
    const zip = new JSZip();
    const resZip = await zip.loadAsync(await fs.readFileSync(`${NODE_ENV == "PROD" ? "public" : PUBLIC_BASE_PATH}/${filePath}`));
    const filesArr: any = Object.keys(resZip?.files);
    const stringBlob = await resZip.files[filesArr[0]].async("string");
    const seperator = getDelimiter(stringBlob);
    const rows = stringBlob.split('\r\n').map(line => line.split(seperator._));
    console.time("generationStart");
    rows.forEach((data: any, index) => {
        if (data[data.length - 1] == '') {
            data.pop();
        }
        for (let index = 0; index < data.length; index++) {
            if (data[data.length - 1] == '') {
                return data.pop();
            }

        }
    })
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet();
    worksheet.setName("Sheet1");
    const headers = rows[0];
    const data = rows.slice(1);


    // // worksheet.writeRowWithFormat(0, 0, tdsObj[e][0], headerStyle);
    // const headers = rows[0];
    // const data = rows.slice(1);

    // const headerFormat = new Format()
    //     .setBold()
    //     .setBorder(FormatBorder.Medium)
    //     .setForegroundColor(Color.rgb(0xC5D9F1));

    // headers.forEach((e, i) => {
    //     // const columnLetter = i;
    //     // allColumns[columnLetter] = [];

    //     worksheet.writeWithFormat(0, i, e, headerFormat);
    //     // worksheet.write(0, i, e);
    //     // allColumns[columnLetter].push(e);
    // })
    // const borderFormat = new Format().setBorder(FormatBorder.Thin);

    // worksheet.writeRowMatrix(1, 0, rows.slice(1),borderFormat);

    // worksheet.autofit();

    // const filePathOutput = `public/${finalFileName}.xlsx`;
    // console.log(filePathOutput, "filePathOutput");

    // const uint8Array = workbook.saveToBufferSync();
    // fs.writeFileSync(filePathOutput, uint8Array);
    // console.timeEnd("generationStart");
    // return `${finalFileName}.xlsx`;
    // return



    const headerFormat = new Format()
        .setBold()
        .setBorder(FormatBorder.Medium)
        .setForegroundColor(Color.rgb(0xC5D9F1));

    const oddBorderFormat = new Format()
        .setBorder(FormatBorder.Thin)
        .setForegroundColor(Color.rgb(0xE6E6E6));

    const evenBorderFormat = new Format().setBorder(FormatBorder.Thin);

    // const worksheet = workbook.addWorksheet();
    // worksheet.setName("Sheet1");

    let allColumns: any = {};

    headers.forEach((e, i) => {
        const columnLetter = i;
        allColumns[columnLetter] = [];

        worksheet.writeWithFormat(0, i, e, headerFormat);
        // worksheet.write(0, i, e);
        allColumns[columnLetter].push(e);
    })
    Array.from(Object.values(data), (arr, index) => {

        // @ts-ignore
        Object.entries(arr).forEach((a, b) => {
            if (allColumns[b][0] === a[0]) {
                allColumns[b].push(a[1] ?? "");
            }
            // @ts-ignore
            worksheet.writeWithFormat(index + 1, b, a[1], (index % 2 == 0 ? evenBorderFormat : oddBorderFormat));
            // worksheet.write(index + 1, b, a[1])
        })
    })
    Array.from(Object.entries(allColumns), (_, i) => {
        // @ts-ignore
        const wordLen = _?.[1].map(v => v.toString().length);
        const maxLength = Math.max(...wordLen);
        worksheet.setColumnWidth(parseInt(_?.[0]), Math.min(maxLength + 1, 50));
    })

    allColumns = {};

    const filePathOutput = `public/${finalFileName}.xlsx`;
    console.log(filePathOutput, "filePathOutput");

    const uint8Array = workbook.saveToBufferSync();
    fs.writeFileSync(filePathOutput, uint8Array);
    console.timeEnd("generationStart");
    return `${finalFileName}.xlsx`;

    // const workbook = new ExcelJS.Workbook();
    // const worksheet = workbook.addWorksheet("Report");
    // worksheet.columns = headers.map(header => ({ header, key: header }));

    // const borderStyles = {
    //     top: { style: "thin" },
    //     left: { style: "thin" },
    //     bottom: { style: "thin" },
    //     right: { style: "thin" }
    // };

    // console.log(data.length, "data.length");

    // headers.forEach((header, index) => {
    //     const cell = worksheet.getRow(1).getCell(index + 1);
    //     cell.value = header;
    //     // @ts-ignore
    //     cell.border = borderStyles;
    //     cell.font = {
    //         bold: true
    //     };
    //     if (data?.length < 80000) {
    //         cell.fill = {
    //             type: 'pattern',
    //             pattern: 'solid',
    //             fgColor: { argb: 'C5D9F1' }
    //         };
    //     }
    // });

    // worksheet.addRows(data);

    // const rowData = worksheet.getRows(0, (data.length + 1));
    // rowData?.forEach((row, cellIndex) => {
    //     headers.forEach((key, colIndex) => {
    //         const cell = row.getCell(colIndex + 1)
    //         //@ts-ignore
    //         cell.border = borderStyles;
    //         if (data?.length < 80000) {
    //             if (cellIndex % 2 == 0) {
    //                 cell.fill = {
    //                     type: 'pattern',
    //                     pattern: 'solid',
    //                     fgColor: { argb: 'E6E6E6' }
    //                 };
    //             }
    //         }
    //     })
    // })


    // worksheet.columns.forEach((column: any, index: any) => {
    //     // @ts-ignore
    //     const lengths = column.values.map(v => v.toString().length);
    //     const maxLength = Math.max(...lengths.filter((v: any) => typeof v === 'number'));
    //     column.width = maxLength + 2
    // });
    // const filePathOutput = `public/${finalFileName}.xlsx`;
    // await workbook.xlsx.writeFile(filePathOutput);
    // return `${finalFileName}.xlsx`;

}
