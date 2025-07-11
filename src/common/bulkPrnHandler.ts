import fs, { rmdirSync } from "fs";
import PDFParser from "pdf2json";
import { execute } from '../config/db';
import { sDataWriter } from './sDataWriter';
import { callApi } from '../controller/processLogSequenceCancel';
import { removeFile } from './fileUpload/fileSystemHandler';
import path from 'path';
import { PUBLIC_BASE_PATH, SEVEN_ZIP_PATH } from '../config/envConfig';
import { execSync } from 'child_process';
import { littleLegs } from "./delay";

export const slash = process.platform == "win32" ? '\\' : '/';

export const bulkFiles = async ({ req, procIudSeq, pwdStrArr }: any) => procIudSeq == "SECOND" ? await processFiles({ req, pwdStrArr }) : (procIudSeq == "FIRST" ? await pdfExtProc(req) : false);

const processFiles = async ({ req, pwdStrArr }: any) => {
    try {
        const { iud_seqno, rowid_seq, upload_file_name, process_seqno, procIudSeq } = req?.body;
        const { default_tds_type_code, default_acc_year, default_quarter_no, default_sub_module_type_code } = req?.currentUser;
        const reqClone: any = JSON.parse(JSON.stringify({
            headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
            body: { ...req?.body },
            bodyClone: {
                "processIudType": "STATUS_UPDATE",
                "process_status_code_fixed": "LF",
                "process_seqno": req?.body?.process_seqno,
                "process_status_code": req?.body?.process_status_code,
                "uploadType": req?.body?.uploadType
            },
            currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
        }));
        (async (req) => {
            const procType = 'get_tiud_tds_return_tran_bulk';
            const procTypeStat = 'get_tiud_file_tran_dib_prnbulk';
            const pdfFolder = `${PUBLIC_BASE_PATH}${process_seqno}_${upload_file_name}`.replace('.zip', '')
            if (!fs.existsSync(pdfFolder)) { console.error("NOT FOUND"); return false; }
            const files = fs.readdirSync(pdfFolder);
            await Promise.all(files.filter(file => file.endsWith('.pdf')).map(async (file, index) => {
                let fileStatus = "";
                if (!fs.existsSync(`${pdfFolder}${slash}${file}`)) return false;
                const filePath = `${pdfFolder}${slash}${file}`;
                const { token, date, tan, fy, quater, formType } = await pdfParse(filePath);
                // execSync(`rm -rf "${PUBLIC_BASE_PATH}${process_seqno}_${upload_file_name.replace('.zip', '')}"`);
                // await fs.rmSync(`${PUBLIC_BASE_PATH}${process_seqno}_${upload_file_name.replace('.zip', '')}`, { recursive: true, force: true });
                // await removeFile(`${PUBLIC_BASE_PATH}${upload_file_name}`);

                const isValid = (pwdStrArr.includes(tan) && default_acc_year == `${fy}`.slice(2) && quater == `Q${default_quarter_no}` && (default_sub_module_type_code != "G" ? formType == default_tds_type_code : (formType?.includes("G") || formType?.includes("H"))));
                // console.log(isValid, "isValid", pwdStrArr, "pwdStrArr", tan,default_acc_year, "default_acc_year", `${fy}`.slice(2),quater, "quater", `Q${default_quarter_no}`, formType, 'formType', default_sub_module_type_code, "seeeeeeee this ", (default_sub_module_type_code != "G" ?  formType == default_tds_type_code : (formType?.includes("G") || formType?.includes("H"))) )
                if (isValid) {
                    const sdata = sDataWriter(req, iud_seqno, `"a_process_seqno": "", "a_iud_type": "U","a_proc_type": "${procType}", "a_user_code": "${req?.currentUser?.user_code}", "a_process_status_code": "", "a_db_total_records": "1000", "file_tran": { "rowid_seq": "${rowid_seq ?? ""}", "file_upload_ack_no": "${token ?? ""}", "file_upload_ack_date": "${date ?? ""}", "tanno": "${tan ?? ""}", "quater": "${quater ?? ""}", "form_Type": "${formType ?? ""}", "financial_Year": "${fy ?? ""}", "file_upload_ack_pdf_path": "${upload_file_name ?? ""}", "file_upload_ack_pdf_name": "${file ?? ""}" }, "a_process_log_text": "going on..."`);
                    const tiudRes = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace,iud_seqno_replace, :a_in_parameter_json, :a_out_parameter_json,'${req?.currentUser?.user_code}');END;`, sdata, procType, req);
                    console.log(tiudRes, "tiudRes", sdata);
                    console.log(tiudRes?.ogResData?.[0]?.a_proc_error, "tiudRes?.ogResData?.[0]?.a_proc_error");
                    console.log(tiudRes?.ogResData?.[0]?.a_proc_error_message, "tiudRes?.ogResData?.[0]?.a_proc_error_message", tiudRes?.ogResData?.[0]?.a_proc_error_message?.length);
                    const statusFlag = tiudRes?.ogResData?.[0]?.a_proc_error == 0 ? true : false;
                    if (!statusFlag) {
                        console.log(statusFlag, "statusFlag");
                        const reqClone: any = JSON.parse(JSON.stringify({
                            headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
                            body: { ...req?.body },
                            bodyClone: { "processIudType": "STATUS_UPDATE", "process_status_code_fixed": `${req?.body?.uploadType == "bulk" ? "L" : "T"}E`, "process_seqno": req?.body?.process_seqno, "process_status_code": req?.body?.process_status_code, "uploadType": req?.body?.uploadType },
                            currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
                        }))
                        await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `L${false ? "F" : "E"}` } });
                        // await callApi(req, false);
                        return
                    }
                    const res = tiudRes?.ogResData?.[0]?.a_proc_error == 0 ? tiudRes?.ogResData?.[0]?.a_success[0]?.value : tiudRes?.ogResData?.[0]?.a_errors[0]?.value;
                    const tiudToken = res ?? false;
                    console.log("DETAILS : TOKEN - ", tiudToken, "TAN NO :", tan, "FILE NAME : ", upload_file_name);
                    fileStatus = tiudToken ? "S" : "F";
                    console.log(sdata, "sdata---chk");
                } else if (!token) {
                    fileStatus = "Z";
                } else {
                    const secondLetter = (default_acc_year != `${fy}`.slice(2)) ? "F" : (default_sub_module_type_code != "G" ? formType != default_tds_type_code : !["15G", "15H", "15GH"].includes(formType)) ? "T" : (quater != `Q${default_quarter_no}`) ? "Q" : (!pwdStrArr.includes(tan)) ? "TN" : (!date) ? "D" : ""; fileStatus = `X${secondLetter}`;
                }
                console.log("STAT FLAG :", "TAN NO :", tan, "FILE NAME : ", upload_file_name, "FILE STATUS : ", fileStatus);
                const fileTranSdata = sDataWriter(req, iud_seqno, `"a_process_seqno": "", "a_iud_type": "I", "a_proc_type": "${procTypeStat}", "a_proc_error": "0", "a_user_code": "${req?.currentUser?.user_code}", "a_process_status_code": "", "a_pagination_count": "0", "a_db_total_records": "1000", "file_tran": { "rowid_seq": "", "module_type_code": "R", "file_upload_ack_no": "${token ? token : ""}", "file_upload_ack_date": "${date ? date : ""}", "tanno": "${tan ? tan : ""}", "quater": "${quater ? quater : ""}", "form_Type": "${formType ? formType : ""}", "financial_Year": "${fy ? fy : ""}", "file_upload_ack_pdf_path": "${upload_file_name ?? ""}", "file_upload_ack_pdf_name": "${file}", "proc_file_count": "${files?.length}", "proc_file_no": "${index}", "file_load_status": "${fileStatus}", "file_name": "${file}", "import_export_flag": "U", "proc_type1": "get_tiud_file_tran_dib_prnbulk", "process_seqno1": "${process_seqno}" }, "a_process_log_text": "going on..."`); await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace,iud_seqno_replace, :a_in_parameter_json, :a_out_parameter_json,'${req?.currentUser?.user_code}');END;`, fileTranSdata, procTypeStat, req);
                console.log(fileTranSdata, "fileTranSdata");
                return true;
            }));
            await littleLegs(10000); await callApi({ ...req, body: req?.bodyClone }); await prnStatApi(req);
        })(reqClone)
        return true;
    } catch (error) {
        await rqCallApi({ req, callFlag: false });
        console.error("PROCESS FILES ERROR : ", error);
    }
};

const pdfParse: any = (fileName: any) => new Promise((res) => {
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataReady", pdfData => {
        let dateInit = pdfData?.Pages?.[0]?.Texts?.[23]?.R?.[0]?.T?.replace(/%20/g, " ") ?? "";

        if (!dateInit?.match(/\d{2}-\s[A-Za-z]{3}-\d{4}/) || !dateInit.match(/\d{2}-[A-Za-z]{3}-\d{4}/)) {
            dateInit = (pdfData?.Pages?.[0]?.Texts?.map((e) => e?.R[0]?.T?.replace(/%20/g, " ")).join("").match(/\d{2}-\s[A-Za-z]{3}-\d{4}/)?.[0]?.split(" ")?.join("") ?? pdfData?.Pages?.[0]?.Texts?.map((e) => e?.R[0]?.T?.replace(/%20/g, " ")).join("").match(/\d{2}-[A-Za-z]{3}-\d{4}/)?.[0]) ?? pdfData?.Pages?.[0]?.Texts?.map((e) => e?.R[0]?.T?.replace(/%20/g, " ")).join("").match(/\d{1,2}\s(?:January|February|March|April|May|June|July|August|September|October|November|December)\s\d{4}/)?.[0] ?? "";
        }

        let data = pdfData?.Pages?.[0]?.Texts?.reduce((a: any, c: any, idx: any) => {
            const text = c?.R?.[0]?.T?.replace(/%20/g, " ") ?? "";
            if (a.quater && !idx) a.quater = `Q${a.quater}`;
            if (!text) return a;
            if (/^(\d{15})$/.test(text)) a.token = text;
            if (/^([A-Z]{4})(\d{5})([A-Z]{1})$/.test(text)) a.tan = text;
            if (/^(\d{4})-(\d{2})$/.test(text)) a.fy = text;
            if (/^(\d{2})([E-Q]{1,2})$/.test(text)) a.formType = text;
            if (/^Q([1-5]{1})$/.test(text) && !a.quater) a.quater = text;
            return a;
        }, { token: "", date: /20(\d{2})/.test(dateInit) ? dateInit : `${pdfData?.Pages?.[0]?.Texts?.[17]?.R?.[0]?.T}${pdfData?.Pages?.[0]?.Texts?.[18]?.R?.[0]?.T}`, tan: "", fy: "", quater: !!pdfData?.Pages?.[0]?.Texts?.map(e => e?.R?.[0]?.T?.replace(/%20/g, " ")).join("").match(/Quarter ([1-5]{1})/g) ? pdfData?.Pages?.[0]?.Texts?.map(e => e?.R?.[0]?.T?.replace(/%20/g, " ")).join("").match(/Quarter ([1-5]{1})/g)?.[0].split(" ").pop() : "", formType: "" });

        // real 
        // { token: "", date: /20(\d{2})/.test(dateInit) ? dateInit : `${pdfData?.Pages?.[0]?.Texts?.[17]?.R?.[0]?.T}${pdfData?.Pages?.[0]?.Texts?.[18]?.R?.[0]?.T}`, tan: "", fy: "", quater: pdfData?.Pages?.[0]?.Texts.map(e => e?.R?.[0]?.T?.replace(/%20/g, " ") ?? "").join("").match(/Quarter ([1-5]{1})/g)?.[0]?.split?.(" ").pop?.(), formType: "" }

        // data.date = `${new Date(data.date).toLocaleString()}`.split(",")[0];
        const formatIt = data.date;
        console.log(formatIt, "formatIt");
        data.date = formatIt
        res(data);
    });
    pdfParser.loadPDF(fileName);
});

const pdfExtProc = async (req: any) => {
    const { upload_file_name, process_seqno, procIudSeq } = req.body;
    const unzipRes: any = await unzip({ procIudSeq, zipFileName: upload_file_name, process_seqno, req })
    if (!unzipRes) return unzipRes;
    const outputDirectory = `${PUBLIC_BASE_PATH}${process_seqno}_${upload_file_name}`?.replace('.zip', '');
    try {
        return (fs.existsSync(outputDirectory) && Array.isArray(unzipRes)) ? await Promise.all(unzipRes.map(async (pdfPath: any, index: any) => {
            const fileName = path.basename(pdfPath);
            const destinationPath = index > 0 ? outputDirectory + slash + path.parse(fileName).name + '_' + index + path.extname(fileName) : outputDirectory + slash + fileName;
            await fs.promises.rename(pdfPath, destinationPath);
        })) : false;
    } catch (err) {
        console.error('Error moving PDF files:', err);
        return false;
    }
};

const rqCallApi = async ({ req, callFlag }: any) => {
    const reqClone: any = JSON.parse(JSON.stringify({
        headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
        body: { ...req?.body },
        bodyClone: { "processIudType": "STATUS_UPDATE", "process_seqno": req?.body?.process_seqno, "process_status_code": req?.body?.process_status_code, "uploadType": req?.body?.uploadType },
        currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
    }));
    await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `${req?.body?.uploadType == "bulk" ? "L" : "T"}${callFlag ? "C" : "B"}` } });
};

const unzip = async ({ zipFileName, process_seqno, req, procIudSeq }: any) => {
    try {
        const filePath = `${PUBLIC_BASE_PATH}tmp_${zipFileName}`;
        const outputDir = `${PUBLIC_BASE_PATH}${process_seqno}_${zipFileName.replace('.zip', '')}`;
        if (!SEVEN_ZIP_PATH) { console.error("SEVEN_ZIP_PATH NOT FOUND"); return false };
        execSync(`"${SEVEN_ZIP_PATH}" x "${filePath}" -y -r -o"${outputDir}" "*.pdf"`);
        if (!fs.existsSync(outputDir)) { await rqCallApi({ procIudSeq, req, callFlag: fs.existsSync(outputDir) }); return false }; const collectPdfPathsRes = await collectPdfPaths(outputDir); return collectPdfPathsRes;
    } catch (error) { console.error("error : ", error); return false; }
};

const collectPdfPaths = async (directory: any, extractedPdfPaths: any[] = []) => {
    try {
        return fs.readdirSync(directory) ? await Promise.all(fs.readdirSync(directory).map(async (file) => {
            const filePath = `${directory}${slash}${file}`;
            if (fs.statSync(filePath).isDirectory()) await collectPdfPaths(filePath, extractedPdfPaths);
            else if (filePath.toLowerCase().endsWith('.pdf')) extractedPdfPaths.push(filePath);
        })) && extractedPdfPaths : false;
    } catch (error) { console.error('Error while collecting PDF paths:', error); }
}

const prnStatApi = async (req: any) => {
    const { iud_seqno, process_seqno, process_status_code } = req.body;
    const procType = "get_tiud_import_template_statitics_dib_prnbulk"
    const sdata = sDataWriter(req, iud_seqno, `
            "a_iud_type":"i",
            "a_proc_type":"${procType}",
            ${process_status_code ? `"a_process_code":"${process_status_code}",` : ""}
            "a_proc_error":"0",
            "a_db_total_records":"1000",
                        "a_pagination_count":"0",
                        "a_filter_clause" : "" ,
                        "a_ref_process_seqno" : "${process_seqno}"
            `)
    const prnStat: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`, sdata, procType, req);
}