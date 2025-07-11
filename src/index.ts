import express, { json } from "express";
import cors from "cors";
import "express-async-errors";
import { NotFoundError } from "./errors/not-found-error";
import { errorHandler } from "./middlewares/error-handler";
import routes from "./routes";
import fileUpload from "express-fileupload";
import WebSocket from 'ws';
import http from 'http';
import { fileStats, isFileExist } from "./common/fileUpload/fileSystemHandler";
import { ABSOLUTE_PATH_DIR, ABSOLUTE_SFTP_DIR, CORS_ORIGINS, DC_DR_SERVER, DUMP_FILES_PATH_DIR, IFMS_UPLOADED_FILES_PATH_DIR, ORACLE_CLIENT_EXEC_PATH, PORT, PUBLIC_BASE_PATH, RPACPC_API_SECRET, RPACPC_API_TOKEN, RPACPC_API_URL, UTILITY_API_URL } from "./config/envConfig";
import oracledb from "oracledb";
import fs from "fs";
import { reqEncryt } from "./common/reqEncryption";
import FormData from 'form-data';
import axios from "axios";
import { sftpConnect } from "./common/fileUpload/sftpHandler";
import { logLive } from "./common/logLive";
import { s3UploadMultiPart } from "./common/fileUpload/s3Client";
import { watchRclone } from "./common/watchRclone";
import { WatchMinIO } from "./common/minio";
import { pdfGeneration } from "./common/pdfHandler";
import { reportPDFMaker } from "./controller/reportPdf";
export let dbPools: any = {};
import { exec, execSync } from 'child_process';
import { scheduleJob } from 'node-schedule';
import { removeOlderFile } from "./common/fileHandler";
// import { wasmXlsxCSVToJSON } from "./controller/fileUploadWEExcelToCSV";
const util = require('util');
const path = require('path');

// const { convert_xlsx_to_json_streaming_wasm } = require("./common/excelWasm/xlsx_to_csv_wasm.js")


const port = parseInt(PORT || "4000") + 10;

let libPath;

if (process.platform == "win32") libPath = ORACLE_CLIENT_EXEC_PATH;
else if (process.platform === "darwin") libPath = process.env.HOME + "";
else if (process.platform === "linux") libPath = ORACLE_CLIENT_EXEC_PATH;
if (libPath && fs.existsSync(libPath)) oracledb.initOracleClient({ libDir: libPath });

const app = express();
const server = http.createServer(app);

app.use(json({ limit: "50mb" }));
app.use(
    cors({
        origin: CORS_ORIGINS,
        methods: ["POST", "GET"],
    })
);

app.use(reqEncryt);

app.use(
    fileUpload({
        useTempFiles: true,
        tempFileDir: "/tmp/",
        createParentPath: true,
    })
);
app.use(express.static("public"));
app.use("/", routes);

app.all("*", async () => {
    throw new NotFoundError();
});

app.use(errorHandler);

const start = async () => {
    try {
        // await wasmXlsxCSVToJSON({inputFile:"DataImport/All In One Transaction _5lac_in_two_rows.xlsx", outputFile:"outSahil.json", jsonFile:"DataImport/All In One Transaction _5lac_in_two_rows-Val.json"})
        // await reportPDFMaker("APISUMMARY.zip",{ reportName: "SHORT TDS DEDUCTION REPORT", fyYear:"24-25", quarter: "q3", tdsCode: "26Q" })
        // await s3UploadMultiPart({ fileName: "inmagicalmelghat_db.sql", filePath: "public/inmagicalmelghat_db.sql", })

        
        const job = scheduleJob('0 0 0 * * *', function () {
            // console.log('Running task at 12:00 AM');
            removeOlderFile("tdsFile");
        });

        axios.defaults.proxy = false;
        const wss = new WebSocket.Server({ server });
        wss.on('connection', (ws: WebSocket) => {
            ws.on('message', async (msg: string, wsu: WebSocket) => {
                try {
                    const msgPrase: any = msg.toString();
                    let filePath: any;
                    if (msgPrase.includes("justiConsoDownload")) {
                        const saveData = JSON.parse(msgPrase);
                        const dataToSave: any = JSON.stringify(saveData?.data);
                        const firstCond = dataToSave.includes("justiConsoDownloadF") && "justiConsoDownloadF";

                        !(await fs.existsSync(`${PUBLIC_BASE_PATH}tdsReturnFC`)) && await fs.mkdirSync(`${PUBLIC_BASE_PATH}tdsReturnFC`);

                        !(await fs.existsSync(`${PUBLIC_BASE_PATH}tdsReturnFC/${saveData?.fileName.split(".").slice(0, -1).join(".")}`)) && await fs.mkdirSync(`${PUBLIC_BASE_PATH}tdsReturnFC/${saveData?.fileName.split(".").slice(0, -1).join(".")}`);

                        const pathToSave = `${PUBLIC_BASE_PATH}tdsReturnFC/${saveData?.fileName.split(".").slice(0, -1).join(".")}/${saveData?.fileName}`;
                        await fs[!firstCond ? "appendFileSync" : "writeFileSync"](pathToSave, dataToSave.replace(`${firstCond ?? "justiConsoDownload"}=`, "").split(';base64,').pop(), { encoding: "base64" })
                        return;
                    } else if (msgPrase.includes("liveLog")) {
                        const paramArr = (() => {
                            const _ = msgPrase;
                            const obj = JSON.parse(_.split("=")[1]);
                            let cmdArr = [];
                            if (obj?.cstmCmd) return cmdArr = obj?.cstmCmd.split(" ");
                            if (obj?.flush) return cmdArr = ["flush"];
                            if (obj?.reload) return cmdArr = ["reload", obj?.server];
                            cmdArr[0] = "logs"; ``
                            if (obj?.lines != "all") cmdArr = [cmdArr[0], "--lines", obj?.lines]
                            // if (obj?.server != "all") { cmdArr.splice(1, 0, obj?.server); cmdArr = cmdArr; }
                            obj?.server !== "all" && cmdArr.splice(1, 0, obj?.server);
                            return cmdArr;
                        })();
                        console.log(msgPrase, "PARA", paramArr);
                        logLive(msgPrase.includes('"cstmCmd":"') ? paramArr[0] : (process.platform == "win32" ? "pm2.cmd" : "pm2"), msgPrase.includes('"cstmCmd":"') ? paramArr.splice(1) : paramArr, ws);
                    } else if (msgPrase.includes("absolute")) {
                        filePath = ABSOLUTE_PATH_DIR + "/" + msgPrase.split("=")[1];
                        console.log(filePath, "filePath");

                        // zip
                        if (true) {
                            const execAsync = util.promisify(exec);
                            if (filePath.split(".").pop() == "zip") {
                                await execAsync(`cp -r "${filePath}" "${PUBLIC_BASE_PATH}/"`);
                                filePath = msgPrase.split("=")[1];
                            } else {
                                const fileName = filePath?.split("/")?.pop?.().split(".").slice(0, -1).join(".") + ".zip";
                                console.log(fileName, "fileName");
                                await fs.existsSync(`${PUBLIC_BASE_PATH}/${fileName}`) && await fs.unlinkSync(`${PUBLIC_BASE_PATH}/${fileName}`);
                                await execAsync(`zip -r -j "${PUBLIC_BASE_PATH}/${fileName}" "${filePath}"`)
                                filePath = fileName;
                            }
                            console.log(filePath, "filePath");
                        }
                    } else if (msgPrase.includes("ifmsFiles")) {
                        filePath = IFMS_UPLOADED_FILES_PATH_DIR + "/" + msgPrase.split("=")[1];
                        console.log(filePath, "ifmsFiles filePath");
                    } else if (msgPrase.includes("dumpFiles")) {
                        filePath = DUMP_FILES_PATH_DIR + "/" + msgPrase.split("=")[1];
                        console.log(filePath, "dump file filePath");
                    } else {
                        const { os, fileUrl } = JSON.parse((msgPrase.includes("{") && msgPrase.includes("}")) ? msgPrase : "{}");
                        // let filePath = fileUrl ? fileUrl.replace(new RegExp(os == "win32" ? "/" : "\\", "g"), os == "win32" ? "\\" : "/") : msgPrase;
                        filePath = fileUrl ? path.normalize(fileUrl) : msgPrase;
                        if (!filePath.includes("/home") && !(await isFileExist(`${fileUrl ? "" : "/"}${filePath}`, !fileUrl))) return ws.close();
                        filePath = `${!fileUrl && !filePath.includes("/home") ? "public/" : ""}${filePath}`;
                    }
                    if (!msgPrase.includes("liveLog")) {
                        const chunkSize = 1024 * 512;

                        // zip
                        if (msgPrase.includes("absolute") && true) return ws.send(`ZIP AHEAD=${filePath}`);


                        const reader = fs.createReadStream(filePath ?? msgPrase, {
                            highWaterMark: chunkSize
                        })
                        reader.on('data', function (base64Str: any) {
                            ws.send(base64Str);
                        });
                        reader.on('end', function (log: any) {
                            ws.close();
                        });
                    }
                } catch (error) {
                    console.error(error);
                    ws.close();
                }
            });
        });
    } catch (err) {
        console.error(err);
    } finally {
        try {
            // DC_DR_SERVER == "MINIO" ? WatchMinIO() : watchRclone();
        } catch (e) {
            console.log(e, "ERR");
        }
        global.fvuGenInfo = { queue: [] };
        server.listen(port, "0.0.0.0", async () => {
            console.log(`🚀 Server Started at PORT: ${port}`);
        });

    }
};
start();