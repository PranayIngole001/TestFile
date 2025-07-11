import fs, { existsSync, mkdirSync, readdirSync } from 'fs';
import { sDataWriter } from './sDataWriter';
import { execute } from '../config/db';
import { DatabaseSideError } from '../errors/database-side-error';
import { DEBUG_DB, PROCESSON, RPACPC_API_SECRET, RPACPC_API_TOKEN, RPACPC_API_URL, UTILITY_API_URL, SEVEN_ZIP_PATH, FORM_16_UTILITY, PUBLIC_BASE_PATH, NODE_ENV, PUBLIC_BASE_PATH_F16, F16POOLSIZE, F16_GEN_PATH } from '../config/envConfig';
import dotenv from 'dotenv';
import FormData from 'form-data';
import axios from 'axios';
import path from 'path';
import { exec, execSync } from 'child_process';
import { callApi } from '../controller/processLogSequenceCancel';
import { slash } from './bulkPrnHandler';
import { littleLegs } from './delay';
const util = require('util');
dotenv.config();
const execAsync = util.promisify(exec);
// const osName = process.platform == "win32" ? "W" : "U";
const osName = process.platform == "win32" ? "W" : "L";


export const form16Handler: any = async ({ procIudSeq, pwdStrArr, req }: any) => {
    if (procIudSeq == "FIRST") return await processZipFile(req);

    if (procIudSeq == "SECOND") return (async (req) => {
        const reqClone: any = JSON.parse(JSON.stringify({
            headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
            body: { ...req?.body },
            bodyClone: { "processIudType": "STATUS_UPDATE", "process_status_code_fixed": `${req?.body?.uploadType == "bulk" ? "L" : "T"}I`, "process_seqno": req?.body?.process_seqno, "process_status_code": req?.body?.process_status_code, "uploadType": req?.body?.uploadType },
            currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
        }))
        const extractProcRes = await extractProc({ pwdStrArr, req });
        await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `L${extractProcRes ? "F" : "E"}` } });
        console.log(extractProcRes, "extractProcRes SECOND");
    })(req);

    if (procIudSeq == "THIRD") return (async (req) => {
        const form16OnProcRes = await form16OnProc(req, pwdStrArr);
    })(req);
}

const processZipFile = async (req: any) => {
    try {
        const { upload_file_name } = req.body;
        console.log(`${PUBLIC_BASE_PATH}${upload_file_name}`, `${PUBLIC_BASE_PATH}${req?.body?.process_seqno}_${upload_file_name}`, "CHK", upload_file_name);

        if ((upload_file_name.endsWith('.zip') && existsSync(`${PUBLIC_BASE_PATH}${upload_file_name}`))) {
            console.log(`${PUBLIC_BASE_PATH}${upload_file_name}`, `${PUBLIC_BASE_PATH}${req?.body?.process_seqno}_${upload_file_name}`, "CHK2");

            (fs?.renameSync(`${PUBLIC_BASE_PATH}${upload_file_name}` ?? "", `${PUBLIC_BASE_PATH}${req?.body?.process_seqno}_${upload_file_name}`));
        } else {
            console.error("FILE NOT FOUND");
            return false;
        }
        const zipFilePath = `${PUBLIC_BASE_PATH}${req?.body?.process_seqno}_${upload_file_name}`;
        const zipFileName = path.basename(zipFilePath, '.zip');
        const targetFolderPath = `${PUBLIC_BASE_PATH}${zipFileName}`;
        const linux7Zip = SEVEN_ZIP_PATH;
        console.log(`"${linux7Zip}" x "${zipFilePath}" -o"${targetFolderPath}"`, "cmd");
        console.log(process.platform == "win32" ? `"${SEVEN_ZIP_PATH}" x "${zipFilePath}" -o"${targetFolderPath}"` : `"${linux7Zip}" x "${zipFilePath}" -o"${targetFolderPath}"`, "zipCmd---");
        const zipCmd = process.platform == "win32" ? `"${SEVEN_ZIP_PATH}" x "${zipFilePath}" -o"${targetFolderPath}"` : `"${linux7Zip}" x "${zipFilePath}" -o"${targetFolderPath}"`;
        const zipCmdRes = execSync(zipCmd);
        console.log(zipCmdRes, "zipCmdRes---");
        return true;
    } catch (error) {
        console.error("processZipFile :", error);
        return false;
    }
}

const extractProc = async ({ pwdStrArr, req }: any) => {
    try {
        await f16FileTran({ onProc: "d", req, a_TanNo: "", pdf_count: "", statFlag: "", file_name: "" })
        const { upload_file_name, process_seqno } = req.body;
        const zipFileName = upload_file_name?.replace('.zip', '');
        const baseFolderPath = `${PUBLIC_BASE_PATH}${process_seqno}_${zipFileName}`;
        const filesProc = fs.readdirSync(baseFolderPath);
        const zipProc = filesProc.filter(e => e.endsWith('.zip'))
        for (let i = 0; i < zipProc.length; i++) {
            const zipFile: any = zipProc[i];
            const zipPath = baseFolderPath + '//' + zipFile;
            const zipName = zipFile?.split('/')?.pop()?.split('_')?.[0];
            console.log(zipName, zipPath, "zipFile,zipName");
            const tanNo = pwdStrArr?.find((zipPass: any) => new RegExp(`^${zipPass?.substring(0, 3)}.*${zipPass?.slice(-2)}$`)?.test(zipName));
            console.log(zipPath, `${baseFolderPath + '//' + tanNo + '//' + zipFile}`);
            if (!existsSync(`${baseFolderPath + '//' + tanNo}`)) mkdirSync(`${baseFolderPath + '//' + tanNo}`);
            if (tanNo) {
                try {
                    await fs.renameSync(zipPath, `${baseFolderPath + '//' + tanNo + '//' + zipFile}`);
                } catch (e) {
                    await f16FileTran({ onProc: "3", req, a_TanNo: 0, pdf_count: "", file_name: "" })
                    console.log(e, "ERRRNM1");
                    continue;
                }
            } else {
                continue;
            }
        }
        const tanProc = fs.readdirSync(baseFolderPath)
        console.log(tanProc, "tanProc");
        const unzipFiles: any = []
        tanProc.forEach(e => {
            console.log(baseFolderPath + '//' + e + '//', "hhh");
            fs.readdirSync(baseFolderPath + '//' + e + '//').forEach(i => { if (i.endsWith('.zip')) unzipFiles.push(`${e + '//' + i}`) })
        })
        console.log(unzipFiles, "unzipFiles");
        for (let i = 0; i < unzipFiles.length; i++) {
            const zipPath = unzipFiles[i]
            const zipRegEx = zipPath?.split('//')?.[1]?.split('_')?.[0];
            console.log(zipRegEx, "zipRegEx");
            const tanNo = pwdStrArr?.find((zipPass: any) => new RegExp(`^${zipPass?.substring(0, 3)}.*${zipPass?.slice(-2)}$`)?.test(zipRegEx));
            if (!existsSync(SEVEN_ZIP_PATH)) await statusUp({ req, statusUpFlag: false });
            if (tanNo) {
                const folderPath = `${baseFolderPath}/${zipPath.replace('.zip', '')}`;
                console.log(folderPath, "folderPath");
                const zipCmd = process.platform === "win32"
                    ? `"${SEVEN_ZIP_PATH}" t -p"${tanNo}" "${folderPath}.zip"`
                    : `"${SEVEN_ZIP_PATH}" t -p"${tanNo}" "${folderPath}.zip"`;
                const out = execSync(zipCmd, { encoding: 'utf-8' });
                if (out.includes('Everything is Ok')) {
                    const unzipCmd = process.platform == "win32"
                        ? `"${SEVEN_ZIP_PATH}" x -p"${tanNo}" "${folderPath}.zip" -o"${folderPath}" -y`
                        : `"${SEVEN_ZIP_PATH}" x -p"${tanNo}" "${folderPath}.zip" -o"${folderPath}" -y`;
                    execSync(unzipCmd);
                    const rnName = zipPath?.split('//')?.[1]?.replace('.zip', '');
                    const rnFiles = readdirSync(folderPath);
                    console.log(rnFiles, "rnFiles");
                    const fullOpPath = `${baseFolderPath}/${tanNo}`;

                    for (let i = 0; i < rnFiles.length; i++) {
                        const mvPath = fullOpPath + '/' + rnName + '.txt';
                        console.log(mvPath, "mvPath");
                        try {
                            await fs.renameSync(`${folderPath}/${rnFiles[i]}`, mvPath);
                        } catch (e) {
                            console.log(e, "ERRRNM");
                            continue
                        }
                    }
                    f16FileTran({ onProc: "2", req, a_TanNo: tanNo, pdf_count: "", passStatus: "S" });
                } else {
                    // f16FileTran({ onProc: "3", req, a_TanNo: tanNo, pdf_count: "", passStatus: "XTN" });
                }
            } else {
                console.log(unzipFiles.length);
                if (unzipFiles.length <= 1) {
                    console.log("NO valid files to poces");
                    return false;
                } else {
                    // f16FileTran({ onProc: "2", req, a_TanNo: tanNo, pdf_count: "", statFlag: "", passStatus: "F" });
                    f16FileTran({ onProc: "2", req, a_TanNo: tanNo, pdf_count: "", statFlag: "", passStatus: "XTN" });
                }
            }
        }
        return true
    } catch (e) {
        console.log(e, "extractProcErr");
        return false;

    }
};


const genCB = async ({ req, a_TanNo, token, filePath }: any) => {
    // console.log(a_TanNo, filePath, "a_TanNo, filePath", );
    const callRes = await callPs1Api({ req, a_TanNo, pdfLoc: filePath.replace('.txt', '') });
    // console.log(callRes, "callRes");
    await utilProc({ req, txtFilePath: filePath, token });

    const curProcIdx = global.f16ProcessInfo.queue.findIndex((e: any) => e?.fileName == filePath);
    if (curProcIdx != -1) global.f16ProcessInfo.queue[curProcIdx] = {
        ...global.f16ProcessInfo.queue[curProcIdx],
        status: "COMPLETE",
        cb: undefined
    }


    const anyQueueProc = global.f16ProcessInfo.queue.findIndex((e: any) => e?.status == "QUEUE");
    global.f16ProcessInfo.queue[anyQueueProc]?.cb && global.f16ProcessInfo.queue[anyQueueProc]?.cb();
    if (anyQueueProc != -1) global.f16ProcessInfo.queue[anyQueueProc] = {
        ...global.f16ProcessInfo.queue[anyQueueProc],
        status: "RUNNING",
        cb: undefined
    }
    const hasQueueOrRunning = !!global.f16ProcessInfo.queue.find(
        (e: any) => ["QUEUE", "RUNNING"].includes(e?.status)
    );

    const hasToken = global.f16ProcessInfo.queue.some(
        (e: any) => e?.token == token
    );
    console.log(!hasQueueOrRunning && hasToken, "logchk");

    if (!hasQueueOrRunning && hasToken) {
        try {
            if (false) {
                console.log(`rclone move "${F16_GEN_PATH}" "S3:/taxcpc-staging/form16/" -v`);
                if (existsSync(F16_GEN_PATH) && osName == "W") {
                    const rMove = await execAsync(`rclone move "${F16_GEN_PATH}" "S3:/taxcpc-staging/form16/" -v`,
                        { cwd: `C:/Program Files/rclone`, maxBuffer: 1024 * 1024 * 500 })
                    console.log(rMove.stdout, rMove.stderr, "e/o");
                }
            }
            console.log(`rclone copy "${F16_GEN_PATH}" "DRSV2:" -v`);
            if (existsSync(F16_GEN_PATH) && osName == "W" && NODE_ENV == "PROD") {
                const rMove = await execAsync(`rclone copy "${F16_GEN_PATH}" "DRSV2:" -v`,
                    { cwd: `C:/Program Files/rclone`, maxBuffer: 1024 * 1024 * 500 })
                console.log(rMove.stdout, rMove.stderr, "e/o");
            }
            // await rm(req)
            await statusUp({ req, statusUpFlag: true })
            await frm16StatApi(req, true)
            global.f16ProcessInfo.queue = global.f16ProcessInfo.queue.filter((e: any) => e?.token != token)
        } catch (e) {
            console.log(e, "e");
            throw new DatabaseSideError("S3 err", 400)
        }
    }
};

const form16OnProc: any = async (req: any, pwdStrArr: any) => {
    try {
        global.f16ProcessInfo = { ...(global.f16ProcessInfo ?? {}) }
        const { upload_file_name, process_seqno } = req?.body;
        await procMsg({
            req,
            queryMsg: `declare l_local_proc_error_w varchar2(1000); BEGIN pkg_tds_imp_template.proc_process_log_file_w('${process_seqno}','A','Please note that PDF generation may take a few hours. Thank you for your patience.',l_local_proc_error_w);END;`
        });
        const folderPath = `${PUBLIC_BASE_PATH}${req?.body?.process_seqno}_${upload_file_name?.replace('.zip', '')}`;
        const tanDirS = fs.existsSync(folderPath) && fs.readdirSync(folderPath).filter(e =>
            fs.statSync(`${folderPath}/${e}`)?.isDirectory()
        );
        if (!tanDirS || !tanDirS.length) {
            console.log(tanDirS, "tanDirS EMPTY");
            statusUp({ req, statusUpFlag: false });
            return
        }
        global.f16ProcessInfo = {
            queue: [...(global.f16ProcessInfo?.queue ?? [])]
        }
        // console.log(tanDirS, "tanDirS");
        let txtFiles: any = [];
        const reqClone: any = JSON.parse(JSON.stringify({ headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }, body: { ...req?.body }, currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin } }))
        for (let i = 0; i < tanDirS.length; i++) {
            const e = folderPath + `\\` + tanDirS[i];
            txtFiles = [...txtFiles, ...(await fs.readdirSync(e)).filter(e => e.endsWith('.txt')).map(e => tanDirS[i] + `\\` + e)]
        }
        const poolSize = !isNaN(F16POOLSIZE) ? F16POOLSIZE : txtFiles?.length;

        for (let i = 0; i < txtFiles.length; i++) {

            if (global.f16ProcessInfo.queue.filter((e: any) => e?.status == "RUNNING").length >= poolSize) {
                global.f16ProcessInfo.queue.push({
                    token: process_seqno,
                    status: "QUEUE",
                    fileName: txtFiles[i],
                    cb: async () => await genCB({ req: reqClone, a_TanNo: txtFiles[i].split('\\')[0], filePath: txtFiles[i], token: process_seqno })
                })
            } else {
                global.f16ProcessInfo.queue.push({
                    token: process_seqno,
                    status: "RUNNING",
                    fileName: txtFiles[i]
                })
                genCB({ req: reqClone, a_TanNo: txtFiles[i].split('\\')[0], filePath: txtFiles[i], token: process_seqno })
            }
        }
        console.log(global.f16ProcessInfo.queue, "Q");
    } catch (error) {
        console.error(error, "form16OnProc");
        return false;
    }
};

const form16PdfGen = async ({ txtFilePath, txtFolderName, folderFileContentPath, fileFileContentPath, zip_folderFileContentPath, zipFileContentPath, txtName, seqno, reqClone, isFinal, runFlag }: any) => {
    try {
        await littleLegs(2000);
        console.log({ txtFilePath, txtFolderName, folderFileContentPath, fileFileContentPath, zip_folderFileContentPath, zipFileContentPath }, "form16PdfGen_awsPs1");
        const formData = new FormData();
        formData.append('fileName', txtFolderName);
        formData.append('txtFileName', txtName);
        formData.append('textFile', fs.readFileSync(txtFilePath), { filename: txtFolderName });
        formData.append('folderFile', fs.readFileSync(folderFileContentPath), { filename: folderFileContentPath.split("/").pop() });
        formData.append('fileFile', fs.readFileSync(fileFileContentPath), { filename: fileFileContentPath.split("/").pop() });
        formData.append('zip_folder', fs.readFileSync(zip_folderFileContentPath), { filename: zip_folderFileContentPath.split("/").pop() });
        formData.append('zipFile', fs.readFileSync(zipFileContentPath), { filename: zipFileContentPath.split("/").pop() });
        formData.append('seqNo', seqno);
        formData.append('reqClone', JSON.stringify(reqClone));
        formData.append('isFinal', isFinal);
        formData.append('runFlag', runFlag);
        const pdfGenRes = await axios.post(`${UTILITY_API_URL}form-16-job`, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });
        console.log(pdfGenRes, "pdfGenRes");
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
};

const utilProc = async ({ req, txtFilePath, token }: any) => {
    return new Promise((res) => {
        try {
            const { upload_file_name } = req.body;
            console.log(txtFilePath, "txtFilePath");
            const txtToProc = `${PUBLIC_BASE_PATH}${req?.body?.process_seqno}_${upload_file_name?.replace('.zip', '')}/${txtFilePath.replace('\\', '/')}`
            const pathToPDF = txtToProc.replace('.txt', '')

            console.log(pathToPDF, "pathToPDF", txtToProc, txtFilePath?.replace('\\', '/')?.split('/')?.[0]);
            if (existsSync(txtToProc) && existsSync(FORM_16_UTILITY) && fs.createReadStream(txtToProc, { encoding: 'utf8', highWaterMark: 0.5 * 1024 })?.once('data', (chunk) => {
                fs.createReadStream(txtToProc, { encoding: 'utf8', highWaterMark: 0.5 * 1024 })?.pause();
                return chunk?.includes('^')
            })) {
                const folderName = `${req?.body?.process_seqno}_${txtFilePath.replace('\\', '/').split('/')[1].replace(".txt", "")}_folder.bat`;
                const fileName = `${req?.body?.process_seqno}_${txtFilePath.replace('\\', '/').split('/')[1].replace(".txt", "")}_file.bat`;
                const zipFolderName = `${req?.body?.process_seqno}_${txtFilePath.replace('\\', '/').split('/')[1].replace(".txt", "")}_zipFolder.bat`;
                const zipFileName = `${req?.body?.process_seqno}_${txtFilePath.replace('\\', '/').split('/')[1].replace(".txt", "")}_zip.bat`;
                const stdout = exec(`java -jar "${FORM_16_UTILITY}" "${txtToProc}" "${pathToPDF}" "false" "" "" "" ""`, async (error, stdout, stderr) => {
                    if (stdout?.toString()?.includes('no_pdf')) {
                        // await runPs1({ ps1Type: folderName, req });
                        await runPs1({ ps1Type: fileName, req });
                        // await runPs1({ ps1Type: zipFolderName, req });
                        await runPs1({ ps1Type: zipFileName, req });
                        const statFlag = await tiudFlags({ req, txtFilePath })
                        await f16FileTran({ onProc: "3", req, a_TanNo: txtFilePath.replace('\\', '/').split('/')[0], pdf_count: stdout.match(/\d+/g)?.toString(), statFlag, passStatus: statFlag, file_name: txtFilePath.replace('\\', '/').split('/')[1] })
                        console.log(stdout?.toString()?.includes('no_pdf'), "stdout", stdout.match(/\d+/g)?.toString());
                        res(true)
                    }
                    res(false)
                })
                console.log(stdout.pid, "pid");
                const curProcIdx = global.f16ProcessInfo.queue.findIndex((e: any) => e?.fileName == txtFilePath);
                if (curProcIdx != -1) global.f16ProcessInfo.queue[curProcIdx] = {
                    ...global.f16ProcessInfo.queue[curProcIdx],
                    pid: stdout.pid
                }
            } else {
                statusUp({ req, statusUpFlag: false })
            }
        } catch (e) {
            res(false)
            console.log(e, "utilProc err");
        }
    })
};

export const rmPid = async ({ token }: any) => {
    try {
        global.f16ProcessInfo.queue = global.f16ProcessInfo.queue.reduce((a: any, c: any) => {
            c?.token == token ? (c?.status == "RUNNING" && exec(`taskkill /PID ${c?.pid} /T /F`)) : a.push(c);
            return a;
        }, []);
        console.log(global.f16ProcessInfo.queue, "global.f16ProcessInfo.queue");
    } catch (e) {
        console.log(e, "rmPiderror");
    }
}

const callPs1Api: any = async ({ req, a_TanNo, pdfLoc }: any) => {
    try {
        const folderName = `${req?.body?.process_seqno}_${pdfLoc.split('\\')[1]}_folder.bat`;
        const fileName = `${req?.body?.process_seqno}_${pdfLoc.split('\\')[1]}_file.bat`;
        const zipFolderName = `${req?.body?.process_seqno}_${pdfLoc.split('\\')[1]}_zipFolder.bat`;
        const zipFileName = `${req?.body?.process_seqno}_${pdfLoc.split('\\')[1]}_zip.bat`;
        // console.log(folderName, fileName, zipFolderName, zipFileName, "chkIt");

        // const procSrNoBat = ['folder', 'file', 'zip-folder', 'zip'];
        const procSrNoBat = ['file', 'zip'];
        for (let i = 0; i < procSrNoBat.length; i++) {
            const procSrNo = procSrNoBat[i]
            if (a_TanNo?.length == 0) return;
            const { upload_file_name, iud_seqno } = req?.body;
            const callApisProcType = procSrNo == "folder" ? "get_tiud_f16_file_folder" : procSrNo == "file" ? "get_tiud_f16_file_copy" : procSrNo == "zip-folder" ? "get_tiud_f16_zip_folder" : "get_tiud_f16_file_zip";
            const processSeqnoFolderBat = procSrNo == "folder" ? folderName : procSrNo == "file" ? fileName : procSrNo == "zip-folder" ? zipFolderName : zipFileName;
            const procFilePathWin = `${PUBLIC_BASE_PATH}${req?.body?.process_seqno}_${upload_file_name?.replace('.zip', '')}/${pdfLoc.replace('\\', '/')}/$deductee_panno$_Q$quarter_no$_20$acc_year$.pdf`
            // console.log(procFilePathWin, "procFilePathCheck>>>>");
            const sdata = sDataWriter(
                req,
                iud_seqno, ` "a_process_seqno":"", "a_proc_type":"${callApisProcType}", "a_iud_type":"i", "a_user_code":"11", "a_process_status_code":"", "a_db_total_records":"1000", "a_tanno":"${a_TanNo ?? ""}",        "a_form_16_pdf_file_from_path":"${procSrNo == "file" ? procFilePathWin : ""}", "a_os_platform":"${osName}", "a_process_log_text":"going on..." `);
            // console.log(sdata, "sdataPS1");
            const callApisProcTypeRes = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace, : a_in_parameter_json, : a_out_parameter_json, '${req?.currentUser?.user_code}'); END; `, sdata, callApisProcType, req);
            let execRes: any;
            if (callApisProcTypeRes?.a_success?.[0]?.value) {
                execRes = await execute(processSeqnoFolderBat, callApisProcTypeRes?.a_success?.[0]?.value, "", req, "transferToApp")
                // console.log("<<<", callApisProcTypeRes?.a_success?.[0]?.value, "rowseqId", callApisProcType, a_TanNo, ">>>");
            } else {
                console.log("!!! ROW SEQ UNDEFINED !!!");
                // console.log("<<<", callApisProcTypeRes?.a_success?.[0]?.value, "rowseqId", callApisProcType, a_TanNo, ">>>");
                continue;
            }
            if (procSrNoBat.length - 1 == i) return execRes;
        }
    } catch (error) {
        console.log(error, "callPs1Apierror");
    }
}

export const runPs1 = async ({ ps1Type, req, osName }: any) => {
    try {
        const ps1Path = `${PUBLIC_BASE_PATH}${ps1Type}`
        if (existsSync(ps1Path)) {
            console.log(`${ps1Path}, ${{ cwd: 'C:/Program Files/rclone' }}`);
            if (ps1Path.includes('file')) {
                console.log(ps1Path, "<<< ps1Path >>>");

                await execAsync(osName == "W" ? `${ps1Path} -y` : `sh ${ps1Path}`, { cwd: osName == "W" ? 'C:/Program Files/rclone' : undefined })
            };
            if (ps1Path.includes('zip')) {
                console.log(ps1Path, "<<< ps1Path >>>");
                await execAsync(osName == "W" ? `${ps1Path} -y` : `sh ${ps1Path}`, { cwd: osName == "W" ? 'C:/Program Files/rclone' : undefined });
            }
        }
        // const ps1Path = `${ PUBLIC_BASE_PATH }${ ps1Type }`
        // if (existsSync(ps1Path)) {
        //     console.log(ps1Path, "<<< ps1Path >>>");
        //     await execAsync(`powershell.exe - WindowStyle Hidden - Command "Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force; & '${ps1Path}'`, { encoding: 'utf-8' })
        // }
    } catch (error) {
        console.error('Error executing PowerShell commands:', error);
    }
}

export const frm16StatApi = async (req: any, flag: any) => {
    try {
        const { iud_seqno, process_seqno, process_status_code } = req.body;
        const procType = "get_tiud_import_template_statitics_dib_tds_frm16"
        const sdata = sDataWriter(req, iud_seqno, `
            "a_iud_type":"i",
            "a_proc_type":"${procType}",
            ${process_status_code ? `"a_process_code":"L${flag ? "I" : "H"}",` : ""}
            "a_proc_error":"0",
            "a_db_total_records":"1000",
                        "a_pagination_count":"0",
                        "a_filter_clause" : "" ,
                        "a_ref_process_seqno" : "${process_seqno}"
                        `)
        console.log(sdata, "sdata");
        const frm16Stat: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`, sdata, procType, req);
        console.log(frm16Stat, "frm16Stat");
    }
    catch (e) {
        console.log(e, "err_frm16StatApi");
    }
}

export const f16FileTran = async ({ onProc, req, a_TanNo, pdf_count, statFlag = "", passStatus = "", file_name = "" }: any) => {
    try {
        const { iud_seqno, rowid_seq, upload_file_name, process_seqno, procIudSeq } = req?.body;
        const procTypeStat = 'get_tiud_file_tran_dib_tds_frm16';
        const fileTranSdata = sDataWriter(req,
            iud_seqno,
            `"a_process_seqno": "",
        "a_iud_type": "${onProc == "d" ? "d" : onProc == "3" ? "U" : "I"}",
        "a_proc_type": "${procTypeStat}",
        "a_proc_error": "0",
        "a_user_code": "${req?.currentUser?.user_code}",
        "a_process_status_code": "",
        "a_pagination_count": "0",
        "a_db_total_records": "1000",
    "file_tran": {
        "rowid_seq": "",
        "module_type_code": "R",
        "file_name" : "${file_name ? file_name : ""}",
        "tanno": "${a_TanNo ? a_TanNo : ""}",
        "file_no_of_record1": "${a_TanNo ? 1 : 0}",
        "file_no_of_record2": "${onProc == "3" ? (pdf_count ? pdf_count : "") : ""}",
        "file_load_status": "${a_TanNo ? "S" : passStatus}",
        "import_export_flag": "${statFlag}",
        "proc_type1": "${procTypeStat}",
        "pass_status" : "${passStatus}",
        "process_seqno1": "${process_seqno}"
        },
        "a_process_log_text": "going on..."`);
        const fileTranSdataRes = await execute(
            `BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace, :a_in_parameter_json, :a_out_parameter_json, '${req?.currentUser?.user_code}'); END;`,
            fileTranSdata,
            procTypeStat,
            req
        );
        console.log(fileTranSdata, fileTranSdataRes, "0-000");
    } catch (e) {
        console.log(e, "f16FileTran_err");
    }
};

export const procMsg = async ({ req, queryMsg }: any) => {
    try {
        console.log(queryMsg, "queryMsg");
        await execute(queryMsg, null, null, req, "queryexecute");
    } catch (error) {
        console.log(error, "procMsgErro");
    }
}

const statusUp = async ({ req, statusUpFlag }: any) => {
    const reqClone: any = JSON.parse(JSON.stringify({
        headers: { ...req?.headers, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin },
        body: { ...req?.body },
        bodyClone: { "processIudType": "STATUS_UPDATE", "process_status_code_fixed": `${req?.body?.uploadType == "bulk" ? "L" : "T"}${statusUpFlag ? "I" : "H"}`, "process_seqno": req?.body?.process_seqno, "process_status_code": req?.body?.process_status_code, "uploadType": req?.body?.uploadType },
        currentUser: { ...req?.currentUser, homeorigin: req?.headers?.homeorigin ?? req?.headers?.Homeorigin }
    }))
    console.log("checkit...");
    console.log(reqClone.bodyClone.process_status_code_fixed, "process_status_code_fixed");
    await callApi({ ...reqClone, body: { ...reqClone?.bodyClone, process_status_code_fixed: `L${statusUpFlag ? "I" : "H"}` } });
}

const tiudFlags = async ({ req, txtFilePath }: any) => {
    const qNo = req?.currentUser?.default_quarter_no
    const fType = req?.currentUser?.default_tds_type_code
    const fYear = req?.currentUser?.default_acc_year
    console.log(txtFilePath, "txtFilePath...---");
    console.log(`Q${qNo}`, fType, fYear, "chk data");
    let txtStr = txtFilePath?.split('//')?.pop()?.split('_').join('_');
    let [, fileForm, fileYear, fileQuarter] = txtStr?.match(/(FORM16A)_(\d{4}-\d{2})_(Q\d)/) || [];
    console.log({ fileYear, fileQuarter, fileForm }, "chk data...---");
    let statFlag = "";
    if (fileQuarter != `Q${qNo}`) {
        statFlag = 'XQT'
        console.log(statFlag, "statFlag");
    } else if (fileYear != `20${fYear}`) {
        statFlag = 'XFY'
        console.log(statFlag, "statFlag");
    } else if (fileQuarter != `Q${qNo}` && fileYear != `20${fYear}`) {
        statFlag = 'XQF'
        console.log(statFlag, "statFlag");
    }
    //send Z if failed to read file
    //XTN tan not valid
    else if (qNo == '27EQ') {
        statFlag = (fileForm == 'FORM16A') ? 'XTC' : '';
        console.log(statFlag, "statFlag");
    }
    return statFlag;
}

const rm = async (req: any) => {
    try {
        const filesToRemove = fs.readdirSync('public/')?.filter(file => file.startsWith(req?.body?.process_seqno));
        const removeDirectory = async (dirPath: string, retries = 5, delay = 1000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    return (fs.existsSync(dirPath)) ? fs.rmSync(dirPath, { recursive: true, force: true }) : ""
                } catch (error) {
                    if (error.code === 'EBUSY') await new Promise(res => setTimeout(res, delay));
                    else throw error;
                }
            }
        };
        setTimeout(() => filesToRemove?.forEach(file => removeDirectory(path.join('public', file))), 30000);
    } catch (err) {
        console.error("Error removing directories:", err);
    }
};

export const dbCallback = async ({ req, fls, flr, pdfCount }: any) => {
    try {
        const { iud_seqno, process_seqno } = req.body;
        if (!req?.currentUser) return null;
        const procType = "get_tiud_file_tran_f16"
        const sdata = sDataWriter(req, iud_seqno, ` "a_iud_type": "u", "a_process_seqno": "", "a_proc_type": "${procType}", "a_proc_error": "0", "a_ref_process_seqno": "${process_seqno ?? ""}", "a_user_code": "${req?.currentUser?.user_code}", "file_tran": { "file_load_status ": "${fls}", "file_load_remark ": "${flr}", "pdf_count": "${pdfCount}"}`)
        const result: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace,iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`, sdata, procType, req);
        if (!result && DEBUG_DB) throw new DatabaseSideError("RESULT IS NULL", 400);
        const { errors, error_message } = result;
        if (errors) { (errors.length) ? () => { throw new DatabaseSideError(errors, 400) } : () => { throw new DatabaseSideError(error_message, 400) }; }
    } catch (error) {
        console.log(error, "dbCallback");
    }
}