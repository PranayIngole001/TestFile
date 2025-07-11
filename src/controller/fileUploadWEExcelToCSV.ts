import { Request, Response, Router } from 'express';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import sCode from '../common/status-codes';
import validateSqlInjection from '../middlewares/validateSqlInjection';
import * as fs from 'fs-extra';
import { PUBLIC_BASE_PATH, EXCEL_TO_CSV_EXTENTION } from '../config/envConfig';
import { exec, execSync } from 'child_process';
import util from 'util';
import { WASI } from "node:wasi";
import process from "node:process";

// const { convert_xlsx_to_json_streaming_wasm } = require("../common/excelWasm/xlsx_to_csv_wasm.js")

const { ok } = sCode;
const execAsync = util.promisify(exec);
const router = Router();
router.post('/file-upload-we-excel-to-csv',
    [currentUser, requireAuth],
    async (req: Request, res: Response) => {

        try {
            const chunk = req?.files?.chunk;
            console.log("before chunk check")
            if (!chunk || Array.isArray(chunk)) {
                console.log("before chunk check")
                return res.status(ok).send({
                    status: "FAILED",
                    code: "0",
                    chunkstatus: { status: "Failed", chunkStatusCode: 0 },
                    message: "Chunk data is missing or invalid"
                });
            }
            !(await fs.existsSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}`)) && await fs.mkdirSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}`);
            const filePathWithBase = `${req.body?.mainFolderToSave}/${req.body?.filename}`;
            const filePath = `${PUBLIC_BASE_PATH}${filePathWithBase}`;
            console.log(chunk)

            if (req.body?.chunkIndex == "0") {
                try {
                    await chunk?.mv(filePath);
                } catch (error) {
                    console.log(error);
                    //(await fs.existsSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`)) && await fs.promises.rm(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`, { recursive: true, force: true });
                    return res.status(ok).send({
                        status: "FAILED",
                        code: "0",
                        chunkstatus: { status: "Failed", statusCode: 0 },
                        message: "Error while writing chunk to file"
                    })
                }
            } else {
                console.log("in the non 0")
                try {
                    await chunk?.mv(filePath + `part${req.body?.chunkIndex}`);
                    await fs.appendFileSync(filePath, await fs.readFileSync(filePath + `part${req.body?.chunkIndex}`), { encoding: "binary" });
                    await fs.unlinkSync(filePath + `part${req.body?.chunkIndex}`);
                } catch (error) {
                    console.log(error);
                    console.log("in the catch block");
                    //(await fs.existsSync(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`)) && await fs.promises.rm(`${PUBLIC_BASE_PATH}${req.body?.mainFolderToSave}/${fileSavedFolderName}`, { recursive: true, force: true });
                    return res.status(ok).send({
                        status: "FAILED",
                        code: "0",
                        chunkstatus: { status: "Failed", statusCode: 0 },
                        message: "Error while writing chunk to file"
                    })
                }
            }

            return res.status(ok).send({
                status: "SUCCESS",
                code: "1",
                chunkstatus: { status: "SUCCESS", statusCode: 1 },
                filename: filePathWithBase,
                message: "Chunk Uploaded Successfully"
            });
        } catch (err) {
            console.error(err);
            return res.status(ok).send({
                status: "FAILED",
                code: "0",
                chunkstatus: { status: "Failed", statusCode: 0 },
                message: "Error while writing chunk to file"
            });
        }
    }

);
export { router as fileuploadweExceltoCSV };


export const wasmXlsxCSVToJSON = async ({ inputFile, outputFile, jsonFile, chunkSplitRowCount, delimiterCSV }: any) => {
    try {
        const config = {
            // @ts-ignore 
            version: "preview1",
            args: ["wasi-demo", `/sandbox/${inputFile}`, `/sandbox/${outputFile}`, "100", "1000000",
                inputFile.split(".").pop().toLowerCase() == "xlsx" ? "json" : "csvtojsonwz",
                `/sandbox/${jsonFile}`, chunkSplitRowCount ?? "100000", ...(delimiterCSV ? [delimiterCSV] : [])], // Pass input/output files as CLI args
            env: process.env,
            preopens: {
                "/sandbox": "public", // sandbox folder containing inputBlg.xlsx
            },
        }
        const wasi: any = new WASI(config);
        console.log(config);

        const wasmBuffer: any = await fs.readFileSync("./xlsx_to_csv_wasm.wasm");
        console.time("WASM Execution Time");
        const wasmModule = await WebAssembly.compile(wasmBuffer);
        const instance = await WebAssembly.instantiate(wasmModule, {
            ...wasi.getImportObject(),
            env: {
                memory: new WebAssembly.Memory({
                    initial: 256, maximum: 512
                    // initial: 20000,  // 1 gb
                    // maximum: 20000,  // (Optional) Cap at 1 GiB — or omit for unbounded
                }),
            },
        });
        wasi.start(instance);
        console.timeEnd("WASM Execution Time");
        console.log("WASM program finished.");
    } catch (error) {
        console.log(error, "error");

    }
}

