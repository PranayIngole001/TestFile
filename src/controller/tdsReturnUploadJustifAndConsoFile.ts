import { Request, Response, Router } from 'express';
import { currentUser } from "../middlewares/current-user";
import { requireAuth } from "../middlewares/require-auth";
import { validationRequest } from "../middlewares/validate-request";
import { moveReqFileFunction } from '../common/fileHandler';
import { execute } from '../config/db';
import sCode from '../common/status-codes';
import { littleLegs } from "../common/delay";
import * as fs from 'fs';
import { DEBUG_DB, PUBLIC_BASE_PATH, SEVEN_ZIP_PATH } from '../config/envConfig';
import { exec, execSync } from 'child_process';
const { ok } = sCode;
const router = Router();
import util from 'util';
import path from 'path';
const execAsync = util.promisify(exec);
const removeFile = async (fileId: any, procSeq: any, tempDir: any) => {
    (await fs.existsSync(`${PUBLIC_BASE_PATH}tdsReturnFC/${fileId}`)) && await fs.promises.rm(`${PUBLIC_BASE_PATH}tdsReturnFC/${fileId}`, { recursive: true, force: true });
    (await fs.existsSync(`${PUBLIC_BASE_PATH}tdsReturnFC/${tempDir}`)) && await fs.promises.rm(`${PUBLIC_BASE_PATH}tdsReturnFC/${tempDir}`, { recursive: true, force: true });
    (await fs.existsSync(`${PUBLIC_BASE_PATH}tdsReturnFC/${procSeq}`)) && await fs.promises.rm(`${PUBLIC_BASE_PATH}tdsReturnFC/${procSeq}`, { recursive: true, force: true })
}
const runInBackground = async (sdata: any, procType: any, req: any) => {
    const result = await execute(
        `BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`,
        sdata,
        procType,
        req
    );
    console.log(result, "result");
}
router.post('/tds-upload-justi-conso-file',
    [currentUser, requireAuth,], validationRequest,
    async (req: Request, res: Response) => {
        const filterClause = JSON.stringify(req.body.filter ?? []);
        const metadata = req.body?.rowid_seq;
        const fileObject = {
            file: req.body?.filename,
            metadata,
        };
        let shouldBreak = false;
        let proccessFile: any = { filename: fileObject?.file };
        const filename = fileObject?.file;
        const fileId = filename.split(".").slice(0, -1).join(".");
        const procSeq: any = `${Math.floor(Math.random() * 1000000000)}`;
        const tempDir = `isl${(Math.random() + 1).toString(36).substring(2)}_${filename}`;
        try {
            if (!await fs.existsSync(`${PUBLIC_BASE_PATH}tdsReturnFC/${fileId}/${filename}`)) {
                await removeFile(fileId, procSeq, tempDir);
                return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "No File Found" } });
            }
            if (path.extname(filename) == ".zip") {
                let password = fileId.includes(".0.") ? fileId.split(".0.").pop() : fileId.split(".C_").pop();
                if (password?.includes(" ")) {
                    password = password.split(" ")[0];
                }
                try {
                    const zipcmd = `"${SEVEN_ZIP_PATH}" t -p"${password}" "${PUBLIC_BASE_PATH}tdsReturnFC/${fileId}/${filename}"`;
                    const out = execSync(zipcmd, { encoding: "utf-8" });
                    if (!out.includes("Everything is Ok")) {
                        // throw new Error(out.includes("Wrong password") ? "Invalid password" : "Invalid file");
                        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: out.includes("Wrong password") ? "Invalid password" : "Invalid file" } });
                    }
                } catch {
                    await removeFile(fileId, procSeq, tempDir);
                    return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Invalid password" } });
                }
                try {
                    const unzipCmd = `"${SEVEN_ZIP_PATH}" x -p"${password}" "${PUBLIC_BASE_PATH}tdsReturnFC/${fileId}/${filename}" -o"${PUBLIC_BASE_PATH}tdsReturnFC/${tempDir}" -y`;
                    await execAsync(unzipCmd);
                } catch (error) {
                    await removeFile(fileId, procSeq, tempDir);
                    return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Invalid ZIP file" } });
                }
            }
            const pathToExtract = (path.extname(filename) != ".zip") ? `${PUBLIC_BASE_PATH}tdsReturnFC/${fileId}/` : `${PUBLIC_BASE_PATH}tdsReturnFC/${tempDir}/`;
            if (!fs.existsSync(pathToExtract)) {
                await removeFile(fileId, procSeq, tempDir);
                return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Extraction failed" } });
            }
            const extractedFiles = fs.readdirSync(pathToExtract);
            if (extractedFiles.length != 1) {
                await removeFile(fileId, procSeq, tempDir);
                return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Invalid extracted content" } });
            }
            const extractedFile = extractedFiles[0];
            const extension = path.extname(extractedFile);
            const content = await fs.readFileSync(`${pathToExtract}${extractedFile}`, "utf8");
            const lines = content.split("\n").filter((line) => line.trim() !== "");
            const isValid = (extension === ".txt" && lines.length > 8 && lines[1].includes("HDR") && lines[3].includes("CS")) ||
                (extension === ".tds" && lines.length > 8 && lines[1].includes("BH"));
            if (!isValid) {
                await removeFile(fileId, procSeq, tempDir);
                return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Invalid extracted file" } });
            }
            if (path.extname(filename) == ".zip") {
                if (extension === ".txt" && metadata?.file_type == "JUSTI") {
                    let fileerr: string[] = [];
                    if (!lines[1].includes(metadata?.finacial_year)) fileerr.push("account year");
                    if (!lines[1].includes(metadata?.form_type)) fileerr.push("form type");
                    if (!lines[1].includes(`Q${metadata?.quarter_no}`)) fileerr.push("quarter");
                    if (!lines[1].includes(metadata?.tanno)) fileerr.push("Tan number");
                    if (fileerr.length > 0) {
                        await removeFile(fileId, procSeq, tempDir);
                        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: `${fileerr.join(", ")} mismatch` } });
                    }
                } else if (extension === ".tds" && metadata?.file_type == "CONSO") {
                    let fileerr: string[] = [];
                    if (!lines[1].includes(`20${metadata?.finacial_year.replace("-", "")}`)) fileerr.push("account year");
                    if (!lines[1].includes(metadata?.form_type)) fileerr.push("form type");
                    if (!lines[1].includes(`Q${metadata?.quarter_no}`)) fileerr.push("quarter");
                    if (!lines[1].includes(metadata?.tanno)) fileerr.push("Tan number");
                    if (fileerr.length > 0) {
                        await removeFile(fileId, procSeq, tempDir);
                        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: `${fileerr.join(", ")} mismatch` } });
                    }
                } else {
                    if ((metadata?.file_type == "JUSTI")) {
                        if (extension != ".txt") {
                            await removeFile(fileId, procSeq, tempDir);
                            return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Zip does not contain the correct justification file" } });
                        }
                    } else if (metadata?.file_type == "CONSO") {
                        if (extension != ".tds") {
                            await removeFile(fileId, procSeq, tempDir);
                            return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Zip does not contain the correct Conso file" } });
                        }
                    } else {
                        await removeFile(fileId, procSeq, tempDir);
                        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "File and deltails are failed to update" } });
                    }
                }
            }
            const consoChunkFileSavePath = `${PUBLIC_BASE_PATH}tdsReturnFC/${procSeq}`;
            !(await fs.existsSync(consoChunkFileSavePath)) && await fs.mkdirSync(consoChunkFileSavePath);
            if (metadata?.file_type == "JUSTI") {
                const uploadResponse = await execute(`tdsReturnFC/${fileId}/`, procSeq, `${fileId}${extension}`, req, "insertTdsReturnTextFileBlobQuery");
                console.log(uploadResponse, "uploadResponse")
                if (!uploadResponse.rowsAffected) {
                    await removeFile(fileId, procSeq, tempDir);
                    return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "file not uploaded" } });
                }
            } else {
                console.time("convert tds to json")
                const consokeys: { [key: string]: any[] } = {};
                for (let line = 0; line < lines.length; line++) {
                    const key = lines[line].split('^')[1];
                    if (key && !consokeys[key]) {
                        consokeys[key] = [];
                    }
                    const data = lines[line].split('^');
                    if (key) {
                        consokeys[key].push(data);
                    }
                }
                console.timeEnd("convert tds to json")
                const json_keys = Object.keys(consokeys);
                console.log(json_keys, "json_keys")
                for (const [indx, key] of json_keys.entries()) {
                    const consoChunkFileSavePath1 = `${PUBLIC_BASE_PATH}tdsReturnFC/${procSeq}/${key}`;
                    (!(await fs.existsSync(consoChunkFileSavePath1)) && await fs.mkdirSync(consoChunkFileSavePath1));
                    const content = JSON.stringify(consokeys[key]);
                    await fs.writeFile(`${consoChunkFileSavePath1}/${key}.json`, content, err => {
                        if (err) {
                            console.error(err);
                        }
                    });
                    await littleLegs(400);
                    const consoFileProcSeq = `${procSeq}.${indx + 1}`;
                    console.log("7");
                    console.log(`tdsReturnFC/${procSeq}/${key}/`, "tdsReturnFC/${procSeq}/${key}/")
                    try {
                        const uploadResponse = await execute(`tdsReturnFC/${procSeq}/${key}/`, consoFileProcSeq, `${key}.json`, req, "insertTdsReturnTextFileBlobQuery");
                        console.log(uploadResponse, "uploadResponse")
                        if (!uploadResponse.rowsAffected) {
                            shouldBreak = true;
                            break;
                        }
                        console.log("8")
                    } catch {
                        shouldBreak = true;
                        break;
                    }
                };
                if (shouldBreak == true) {
                    await removeFile(fileId, procSeq, tempDir);
                    return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "fail to upload file" } });
                };
            }
            console.log("9")
            const date = new Date(metadata?.file_date);
            const day = String(date.getUTCDate()).padStart(2, "0");
            const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
            const year = date.getFullYear();
            const hours = String(date.getUTCHours()).padStart(2, "0");
            const minutes = String(date.getUTCMinutes()).padStart(2, "0");
            const seconds = String(date.getUTCSeconds()).padStart(2, "0");
            const formattedDateTime = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
            console.log("10")
            if (req?.currentUser) {
                const procType = (metadata?.file_type == "JUSTI") ? "get_tiud_tds_traces_default_tran" : "get_tiud_tds_traces_conso_tran";
                const uploadData = {
                    "a_session_seqno": "session_seqno_replace",
                    "a_iud_seqno": "iud_seqno_replace",
                    "a_proc_type": procType,
                    "a_entity_code": req?.currentUser.entity_code,
                    "a_client_code": (!!metadata?.client_code) ? metadata?.client_code : req?.currentUser.client_code,
                    "a_acc_year": metadata?.finacial_year,
                    "a_quarter_no": metadata?.quarter_no,
                    "a_tran_month": metadata?.tran_month,
                    "a_tran_from_date": metadata?.tran_from_date,
                    "a_tran_to_date": metadata?.tran_to_date,
                    "a_tds_type_code": metadata?.form_type,
                    "a_filter_clause": filterClause,
                    "a_app_json_data_test_rowid_seq": procSeq,
                    "a_iud_type": "i",
                    "a_user_code": req?.currentUser.user_code,
                    "a_tds_traces_default_file_date": formattedDateTime,
                    "a_tds_traces_default_file_name": fileObject?.file,
                    "a_tds_traces_default_process_seqno": procSeq,
                    "a_ref_process_seqno": (metadata?.already_uploaded_file) ? metadata?.already_uploaded_file : procSeq
                }
                const sdata = JSON.stringify(uploadData);
                console.log(sdata, "sdata");
                if (metadata?.file_type == "CONSO") {
                    runInBackground(sdata, procType, req);
                    await removeFile(fileId, procSeq, tempDir);
                    return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "SUCCESS", proccessFile, message: "File will be Upload soon" } });
                } else {
                    const result: any = await execute(
                        `BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`,
                        sdata,
                        procType,
                        req
                    );
                    if (!result && DEBUG_DB) {
                        await removeFile(fileId, procSeq, tempDir);
                        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Failed to upload" } });
                    };
                    const {
                        data,
                        desc,
                        errors,
                        error_message,
                        a_process_seqno,
                        proc_type,
                    } = result;
                    console.log(result, "result");
                    if (Object.keys(result).length === 0 && result?.data == undefined) {
                        await removeFile(fileId, procSeq, tempDir);
                        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "failed to upload" } });
                    }
                    if (errors) {
                        console.log(errors, "errorserrors");
                        if (errors.length) {
                            await removeFile(fileId, procSeq, tempDir);
                            return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "failed to upload file" } });
                        }
                        await removeFile(fileId, procSeq, tempDir);
                        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "failed to upload file" } });
                    }
                }
            } else {
                await removeFile(fileId, procSeq, tempDir);
                return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "Failed to upload" } });
            }
            await removeFile(fileId, procSeq, tempDir);
        } catch (error) {
            await removeFile(fileId, procSeq, tempDir);
            return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "Failed", proccessFile, message: "File and deltails are failed to update" } });
        }

        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { status: "SUCCESS", proccessFile, message: "File and deltails Uploaded Successfully..." } });
    }
)

export { router as tdsReturnUploadJustifAndConsoFile };