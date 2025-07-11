import axios from "axios";
import fs, { existsSync, writeFileSync } from "fs";
import { CLOUD_INFRA_AT, FILE_BASE_PATH, FVU_COMPUTE, LOCAL_CSI_PATH, RPACPC_API_SECRET, RPACPC_API_TOKEN, RPACPC_API_URL, SKIP_GETUSERID, UTILITY_API_URL, UTILITY_BASE_PATH, UTILITY_FILE_FOLDER, UTILITY_FILE_NAME, UTILITY_FILE_VER, slashPath } from "../../config/envConfig";
import { littleLegs } from "../delay";
import { writeFile } from "../fileUpload/fileSystemHandler";
import JSZip from "jszip";
import { putToSFTP } from "../fileUpload/sftpHandler";
import FormData from 'form-data';
import moment from "moment";
import { s3Upload } from "../fileUpload/s3Client";
import { execute } from "../../config/db";
const util = require('util');
const { exec } = require('child_process');
const execAsync = util.promisify(exec);
const ipv4 = () => Math.floor(Math.random() * 256);


const getLocalCSI = (req: any, tnNum: any) => {
    if (!LOCAL_CSI_PATH) return;
    const csiPath = `${LOCAL_CSI_PATH}${req?.currentUser?.default_acc_year}/${req?.currentUser?.default_quarter_no}/${req?.currentUser?.default_tds_type_code}/${tnNum}/`;
    console.log(csiPath);
    if (!fs.existsSync(csiPath)) return;
    const csiFile = fs.readdirSync(csiPath)?.filter(file => file.endsWith('.csi'))?.sort((a, b) => {
        return new Date(`20${a?.substring(10, 16)?.match(/.{1,2}/g)?.reverse()?.join("-")}`) >= new Date(`20${b?.substring(10, 16)?.match(/.{1,2}/g)?.reverse()?.join("-")}`) ? -1 : 1;
    })?.[0]
    return csiFile ? `${csiPath}${csiFile}` : csiFile;
}

export const fvuCloudCall = async () => {
    const formData = new FormData();
    formData.append('fvuKill', true);
    await littleLegs(4000);
    try {
        const fvuGenRes = await axios.post(`${UTILITY_API_URL}fvu-job`, formData, {
            headers: { ...formData.getHeaders() }
        });
        console.log(fvuGenRes, "fvuGenResfvuGenRes");
    } catch (error) {
        console.log(error,"error");
        
    }
}

export const getUserId = async ({ req, csi, folderName, tnNum, rowid_seq, count, total, idx, fileName, fromDate, toDate, fileNameNoExt, mbl, dbCallback }: any) => {
    if (SKIP_GETUSERID) return false;
    try {
        const xForwardedFor = `${ipv4()}.${ipv4()}.${ipv4()}.${ipv4()}`;
        const headers = {
            "X-Forwarded-For": xForwardedFor
        };
        await littleLegs(4000);
        fromDate = moment().subtract(2,"years").format("YYYY-MM-DD") ?? (() => fromDate.split("-").reverse().join("-"))()
        toDate = moment().format("YYYY-MM-DD") ?? (() => toDate.split("-").reverse().join("-"))()
        const reqUserId = await axios.post('https://eportal.incometax.gov.in/iec/guestservicesapi/saveEntity', { "tnNum": tnNum, "mbl": mbl, "areaCd": "91", "name": "tan", "serviceName": "knowYourTanService", "formName": "PO-03-PYMNT" }, { headers });
        if (!reqUserId?.data?.userId) {
            await dbCallback({
                req, path: `${folderName}.zip`, status: "F", idx, total, rowid_seq, failedText: (reqUserId?.data?.messages ?? []).reduce((a: any, c: any) => {
                    a += ` ${c?.code} - ${c?.desc}`;
                    return a;
                }, ''), failed: true
            });
            return false
        }

        await littleLegs(4000);
        const reqDownloadCSI = await axios.post('https://eportal.incometax.gov.in/iec/paymentapi/challan/downloadCSI', { "formData": { "pan": tnNum, fromDate, toDate }, "header": { "reqId": reqUserId.data.userId } }, { headers });
        if (!reqDownloadCSI?.data?.csiResponse) {
            await dbCallback({
                req, path: `${folderName}.zip`, status: "F", idx, total, rowid_seq, failedText: (reqDownloadCSI?.data?.messages ?? []).reduce((a: any, c: any) => {
                    a += ` ${c?.code} - ${c?.desc}`;
                    return a
                }, ''), failed: true
            });
            return false
        }

        if (reqDownloadCSI?.data?.csiResponse != "No Data found" && reqDownloadCSI?.data?.csiResponse != null && reqDownloadCSI?.data?.csiResponse != undefined) {
            !fs.existsSync(`${FILE_BASE_PATH?.replace(/\\/g, "/")}${folderName}`) && fs.mkdirSync(`${FILE_BASE_PATH?.replace(/\\/g, "/")}${folderName}`)
            // console.log("CSI###---\n", reqDownloadCSI?.data?.csiResponse, "\n", "---###");
            fs.writeFileSync(`${FILE_BASE_PATH?.replace(/\\/g, "/")}${folderName}/${fileNameNoExt}CSI.csi`, reqDownloadCSI?.data?.csiResponse);
        } else {
            return false
        }
        return reqUserId.data.userId;
    } catch (error) {
        console.error(error);
        return false
    }
}


export const zipTransfer = async (folderName: any, baseSFTPdir: any, req: any) => {
    const fileArr = await fs.readdirSync(`public/${folderName}`);
    const zip = new JSZip();
    for (let index = 0; index < fileArr.length; index++) {
        const stream = fs.createReadStream(`public/${folderName}/${fileArr[index]}`);
        zip.file(fileArr[index], stream);
    }
    const file = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: {
            level: 6,
        },
    });
    const zipName = `${folderName}.zip`
    await writeFile(file, zipName);

    if (CLOUD_INFRA_AT == "AWS" && req) {
        if (!await s3Upload({ zipName, filePath: `public/${zipName}` })) return false;
        await execute(`SELECT rdsadmin.rdsadmin_s3_tasks.download_from_s3(p_bucket_name => 'taxcpc-staging', p_directory_name => 'TDS_TEXT_FILES') AS TASK_ID FROM DUAL`, null, null, req, "queryexecute")
    } else {
        if (!(await putToSFTP(zipName, baseSFTPdir))) return false
    }
    setTimeout(() => {
        fs.rmSync(`public/${folderName}`, { recursive: true, force: true });
        // await fs.unlinkSync(`public/${zipName}`)
    }, 60000);
    return true
}

// export const genFvuCloud = async ({ req, csi, dbCallback, tnNum, mbl, fileName, folderName, baseSFTPdir, rowid_seq, total, idx, fromDate, toDate, }: any) => {
//     const fileNameNoExt = fileName.split(".").slice(0, -1).join(".");
//     if (LOCAL_CSI_PATH ?  : !await getUserId({ tnNum, req, csi, total, idx, fromDate, toDate, folderName, fileName, fileNameNoExt, mbl, rowid_seq, count: 0, dbCallback })) return;

//     let count = 0;
//     let fileNameCloud;
//     if (FVU_COMPUTE == "ON-PREM") {
//         console.log(FVU_COMPUTE, "FVU_COMPUTE");
//         const cmd = `${UTILITY_FILE_NAME} "${FILE_BASE_PATH}${folderName}${slashPath}${fileName}" "${FILE_BASE_PATH}${folderName}${slashPath}ERROR.err" "${FILE_BASE_PATH}${folderName}${slashPath}${fileNameNoExt}.fvu" "0" "${UTILITY_FILE_VER}" "0" "${FILE_BASE_PATH}${folderName}${slashPath}${fileNameNoExt}CSI.csi"`;
//         exec(cmd, { cwd: `${UTILITY_BASE_PATH}${UTILITY_FILE_FOLDER}` });
//         await new Promise((res) => {
//             const _ = setInterval(async () => {
//                 try {
//                     if ((await fs.readdirSync(`public/${folderName}`)).find(e => e?.includes(".pdf") || e?.includes(".err")) || (count > 3e5)) {
//                         await exec(`taskkill /IM javaw.exe /F`);
//                         clearInterval(_);
//                         res(true);
//                     }
//                     else count += 5000;
//                 } catch (error) {
//                 }
//             }, 5000)
//         })
//         count < 3e5 && await zipTransfer(folderName, baseSFTPdir, req)
//     } else {
//         try {
//             const formData = new FormData();
//             if (existsSync(`public/${folderName}/${fileName}`) && existsSync(`public/${folderName}/${fileNameNoExt}CSI.csi`)) {
//                 formData.append('textFile', await fs.readFileSync(`public/${folderName}/${fileName}`), { filename: `${fileNameNoExt}.txt` });
//                 formData.append('csi', await fs.readFileSync(`public/${folderName}/${fileNameNoExt}CSI.csi`), { filename: `${fileNameNoExt}CSI.csi` });
//                 formData.append('fileName', fileNameNoExt);
//                 await littleLegs(4000);
//                 console.log({ filename: `${fileNameNoExt}.csi` });
//                 const pdfGenRes = await axios.post(`${UTILITY_API_URL}fvu-job`, formData, {
//                     headers: { ...formData.getHeaders() }
//                 });
//                 fileNameCloud = (pdfGenRes?.data?.fileArr ?? [])?.find((e: any) => e?.includes(".zip"));
//             }
//         } catch (error) {
//             console.error(error, ": cloud error");
//         }
//     }
//     await dbCallback({ req, path: FVU_COMPUTE == "CLOUD" ? fileNameCloud : `${folderName}.zip`, status: (FVU_COMPUTE == "CLOUD" ? fileNameCloud : count < 3e5) ? "C" : "F", idx, total, rowid_seq });
//     return count < 3e5;
// }

export const genFvu = async ({ req, csi, dbCallback, tnNum, mbl, fileName, folderName, baseSFTPdir, rowid_seq, total, idx, fromDate, toDate, checkCsi }: any) => {

    console.log("genFvu###\n", { fileName, folderName }, "\n", "###")
    // console.log("genFvu###\n", { req, csi, dbCallback, tnNum, mbl, fileName, folderName, baseSFTPdir, rowid_seq, total, idx, fromDate, toDate, }, "\n", "###")
    const fileNameNoExt = fileName?.split(".").slice(0, -1).join(".");
    const csiFile = getLocalCSI(req, tnNum);
    // console.log(csiFile, "csiFile", LOCAL_CSI_PATH);
    //  if (checkCsi && LOCAL_CSI_PATH ? !csiFile : !await getUserId({ tnNum, req, csi, total, idx, fromDate, toDate, folderName, fileName, fileNameNoExt, mbl, rowid_seq, count: 0, dbCallback })) return;
    const tdsType = req?.currentUser?.default_tds_type_code;

    let count = 0;
    let fileNameCloud;
    if (FVU_COMPUTE == "ON-PREM") {
        console.log(FVU_COMPUTE, "FVU_COMPUTE");
        const cmd = `${UTILITY_FILE_NAME} "${FILE_BASE_PATH}${folderName}${slashPath}${fileName}" "${FILE_BASE_PATH}${folderName}${slashPath}ERROR.err" "${FILE_BASE_PATH}${folderName}${slashPath}${fileNameNoExt}.fvu" "0" "${UTILITY_FILE_VER}" "0" "${FILE_BASE_PATH}${folderName}${slashPath}${fileNameNoExt}CSI.csi"`;
        exec(cmd, { cwd: `${UTILITY_BASE_PATH}${UTILITY_FILE_FOLDER}` });
        await new Promise((res) => {
            const _ = setInterval(async () => {
                try {
                    if ((await fs.readdirSync(`public/${folderName}`)).find(e => e?.includes(".pdf") || e?.includes(".err")) || (count > 3e5)) {
                        await exec(`taskkill /IM javaw.exe /F`);
                        clearInterval(_);
                        res(true);
                    }
                    else count += 5000;
                } catch (error) {
                }
            }, 5000)
        })
        count < 3e5 && await zipTransfer(folderName, baseSFTPdir, req)
    } else {
        await new Promise(async (res) => {
            try {
                const formData = new FormData();
                // if (await existsSync(`public/${folderName}/${fileName}`) && (tdsType == "24G" ? true : await existsSync(csiFile ?? `public/${folderName}/${fileNameNoExt}CSI.csi`))) {
                if (await existsSync(`public/${folderName}/${fileName}`)) {
                    formData.append('textFile', await fs.readFileSync(`public/${folderName}/${fileName}`), { filename: `${fileNameNoExt}.txt` });
                    formData.append('tdsType', tdsType);
                    (tdsType != "24G" && await existsSync(csiFile ?? `public/${folderName}/${fileNameNoExt}CSI.csi`)) && formData.append('csi', await fs.readFileSync(csiFile ?? `public/${folderName}/${fileNameNoExt}CSI.csi`), { filename: `${fileNameNoExt}CSI.csi` });
                    formData.append('fileName', fileNameNoExt);
                    await littleLegs(4000);
                    console.log("205");
                    
                    const fvuGenIndex = global?.fvuGenInfo?.queue?.findIndex((e: any) => e?.status == "ACTIVE");
                    const fvuGenRes = await axios.post(`${UTILITY_API_URL}fvu-job`, formData, {
                        headers: { ...formData.getHeaders() }
                    });
                    console.log(fvuGenRes, "211");

                    fileNameCloud = (fvuGenRes?.data?.fileArr ?? [])?.find((e: any) => e?.includes(".zip"));
                    console.log({ fileNameCloud }, "fvuGenRes fileNameCloud");
                    return res(!!fileNameCloud)
                }
                res(false);
            } catch (error) {
                res(false)
                console.error(error?.response?.data, error, ": FVU cloud error");
            }
        })
    }
    await dbCallback({ req, path: FVU_COMPUTE == "CLOUD" ? fileNameCloud : `${folderName}.zip`, status: (FVU_COMPUTE == "CLOUD" ? fileNameCloud : count < 3e5) ? "C" : "F", idx, total, rowid_seq });
    return count ? count < 3e5 : fileNameCloud ? true : false;
}