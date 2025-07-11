import { Request, Response, Router } from 'express';
import validateSqlInjection from '../middlewares/validateSqlInjection';
import axios from 'axios';
import { DatabaseSideError } from '../errors/database-side-error';
import moment from 'moment';
import * as fs from 'fs-extra';
import { generateLargeJsonFile } from '../common/generateLargeJsonFile';
import { NODE_ENV, PUBLIC_BASE_PATH } from '../config/envConfig';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import { extractZip } from '../common/fileUpload/fileSystemHandler';
import { execute } from '../config/db';
import { wasmXlsxCSVToJSON } from './fileUploadWEExcelToCSV';
// const dockerEndpoint = NODE_ENV == "PROD" ? "http://192.168.2.51/api/docker-api" : `http://localhost:8080`;
export const dockerEndPoint = `http://localhost:8080`;

const rootPath = `${PUBLIC_BASE_PATH}/`;
const router = Router();
const validation: any = {
    "BSR Code": {
        "Data Type": "C"
    },
    "Challan Date": {
        "Data Type": "D"
    },
    "Challan Number": {
        "Data Type": "N"
    },
    "Challan Amount (Including Interest & Late Filling Fees)": {
        "Data Type": "N"
    },
    "Late Payment Interest": {
        "Data Type": "N"
    },
    "Late Filing Fee": {
        "Data Type": "N"
    },
    "PAN Ref-No": {
        "Data Type": "C"
    },
    "PAN No.": {
        "Mandatory": "Y",
        "Data Type": "C"
    },
    "Deductee Name": {
        "Mandatory": "Y",
        "Data Type": "C"
    },
    "Account No.": {
        "Data Type": "C"
    },
    "Section Code": {
        "Mandatory": "Y",
        "Data Type": "C"
    },
    "Party Bill amount": {
        "Data Type": "N"
    },
    "Total Amount Credited (Inclusive of TDS)": {
        "Mandatory": "Y",
        "Data Type": "N"
    },
    "Date of Credit": {
        "Mandatory": "Y",
        "Data Type": "D"
    },
    "Date of Deduction": {
        "Mandatory": "Y",
        "Data Type": "D"
    },
    "TDS Amount": {
        "Mandatory": "Y",
        "Data Type": "N"
    },
    "Surcharge Amt": {
        "Data Type": "N"
    },
    "Cess Amt": {
        "Data Type": "N"
    },
    "Reason for Lower Deduction": {
        "Data Type": "C"
    },
    "Lower Deduction / 15G-15H Certificate No.": {
        "Data Type": "C"
    },
    "Country of Deductee (Mandatory in case of DTAA)": {
        "Data Type": "C"
    },
    "Tax Rate Type": {
        "Data Type": "C"
    },
    "Nature of Remittances": {
        "Data Type": "C"
    },
    "Tax Identification No.": {
        "Data Type": "C"
    },
    "Address": {
        "Data Type": "C"
    },
    "Email ID": {
        "Data Type": "C"
    },
    "Contact No": {
        "Data Type": "C"
    },
    "Office Code (Transactions)": {
        "Data Type": "C"
    },
    "Return Office Code (Challan)": {
        "Data Type": "C"
    },
    "Grossup Indicator": {
        "Data Type": "C"
    },
    "15CA Acknowledgment": {
        "Data Type": "C"
    },
    "New Regime": {
        "Data Type": "C"
    },
    "194N Cash Withdrawal Excess 20 Lacs": {
        "Data Type": "N"
    },
    "194N Cash Withdrawal Excess 1 Cr": {
        "Data Type": "N"
    },
    "194N Cash Withdrawal Excess 3 Cr": {
        "Data Type": "N"
    },
    "Description": {
        "Data Type": "C"
    },
    "JV Number": {
        "Data Type": "C"
    },
    "JV_Line_Number": {
        "Data Type": "C"
    },
    "Debit/Credit Flag": {
        "Data Type": "C"
    },
    "Filller1": {
        "Data Type": "C"
    },
    "Filller2": {
        "Data Type": "C"
    },
    "Filller3": {
        "Data Type": "C"
    },
    "Filller4": {
        "Data Type": "C"
    },
    "Filller5": {
        "Data Type": "C"
    },
    "Filller6": {
        "Data Type": "C"
    },
    "Filller7": {
        "Data Type": "C"
    },
    "Filller8": {
        "Data Type": "C"
    },
    "Filller9": {
        "Data Type": "C"
    },
    "Filller10": {
        "Data Type": "C"
    },
    "Filller11": {
        "Data Type": "C"
    },
    "Filller12": {
        "Data Type": "C"
    },
    "Filller13": {
        "Data Type": "C"
    },
    "Filller14": {
        "Data Type": "C"
    },
    "Filller15": {
        "Data Type": "C"
    },
    "Filller16": {
        "Data Type": "C"
    },
    "Filller17": {
        "Data Type": "C"
    },
    "Filller18": {
        "Data Type": "C"
    },
    "Filller19": {
        "Data Type": "C"
    },
    "Filller20": {
        "Data Type": "C"
    },
    "Line Number": {
        "Data Type": "N"
    }
}


function excelSerialToDateString(serial: any) {
    const num = parseFloat(serial);
    if (isNaN(num) || num < 40000 || num > 55555) return "";
    const date = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
}

router.post('/csv-to-json-convertor',
    [currentUser, requireAuth],
    async (req: Request, res: Response) => {

        const { url, token, isPublic, validationArr, delimiterCSV, chunkSplitRowCount } = req.body;

        const destFilePath = `${url.split(".").pop() == "xlsx" ? url.split("/").slice(0, -1).join("/") : "DataImport"}/${token}/`;
        const outputFile = "out.json";
        !(await fs.existsSync(`${PUBLIC_BASE_PATH}${destFilePath}`)) && await fs.mkdirSync(`${PUBLIC_BASE_PATH}${destFilePath}`);

        const jsonFile = (url.split(".").pop() == "xlsx" ? "" : "DataImport/") + url.split(".").slice(0, -1).join(".") + "-Val.json";

        console.log({ destFilePath, outputFile, jsonFile });
        await fs.writeFileSync(`${PUBLIC_BASE_PATH}${jsonFile}`, JSON.stringify(validationArr));
        await wasmXlsxCSVToJSON({ inputFile: url, outputFile: destFilePath + outputFile, jsonFile, chunkSplitRowCount, delimiterCSV });

        // await fs.unlinkSync(`${PUBLIC_BASE_PATH}${url}`);
        await fs.unlinkSync(`${PUBLIC_BASE_PATH}${jsonFile}`);

        const filesGenerated = await fs.readdirSync(`${PUBLIC_BASE_PATH}${destFilePath}`);
        for (let index = 0; index < filesGenerated.length; index++) {
            const element: any = filesGenerated[index];
            const indexKey = String(parseInt(element.match(/\d+$/)[0], 10) + 1).padStart(3, '0');
            console.log(`${destFilePath}`, token + "." + indexKey, element);
            const uploadResponse = await execute(`${destFilePath}`, token + "." + indexKey, element, req, "insertExcelCsvToJSONBlobQuery", {}, true);
            console.log(uploadResponse, "uploadResponse");
        }

        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { procSeq: token, message: "File converted Successfully..." } });




        // const fName = url;
        // let fullUrl: string;
        // let bufferString: string;
        // let cachedDateJSON: any = {};

        // if (isPublic) {
        //     await extractZip(fName.split(".")?.[0] + ".zip");
        //     bufferString = await fs.readFileSync(`public/${fName}`, { encoding: 'utf-8' }).trim();
        // } else {
        //     bufferString = await fs.readFileSync(`public/${fName}`, { encoding: 'utf-8' }).trim();

        //     if (fName.endsWith(".json")) {
        //         // const procSeq: any = `${token}` ?? `${Math.floor(Math.random() * 1000000000)}`;
        //         // const uploadResponse = await execute(`${procSeq}/${consoFileProcSeq}/`, consoFileProcSeq, fileName, req, "insertTdsReturnTextFileBlobQuery");
        //         // return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { procSeq: data?.procSeq, message: "File converted Successfully..." } });
        //     }
        //     // fullUrl = `${dockerEndPoint}${url}`;
        //     // const fileRes = await axios.get(fullUrl, { responseType: 'arraybuffer' });
        //     // const fileBuffer = fileRes.data;
        //     // const decoder = new TextDecoder('utf-8');
        // }
        // const delimiter = !isPublic ? '|' : ",";
        // const cleanedString = bufferString.split('\n').filter(line => line.split(delimiter).some(val => val.trim() !== '')).join('\n');
        // const lines = cleanedString?.split('\n');
        // let newArr: any = []
        // let header: any = []
        // let addInarr: any = false;
        // const mandatoryFields = Object.keys(validationArr).filter((key) => validationArr[key].Mandatory === "Y");

        // lines.map((e, i) => {
        //     if (e?.includes(mandatoryFields[0])) {
        //         header = e.split(delimiter);
        //         addInarr = true;
        //     } else {
        //         addInarr && newArr.push(e.split(delimiter).slice(0, 60));
        //     }
        // })

        // const dateFormatHandle = (value: any) => {
        //     if (value in cachedDateJSON) return cachedDateJSON?.[value];
        //     cachedDateJSON[value] = (value ? (isNaN(value) ? (moment(value, ["DD/MM/YYYY", "DD/MMM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "DD-MM-YY", "MMM-DD-YYYY"], true).isValid() ? moment(value, ["DD/MM/YYYY", "DD/MMM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "DD-MM-YY", "MMM-DD-YYYY"], true).format("DD-MM-YYYY") : "") : excelSerialToDateString(value)) : "");

        //     return cachedDateJSON[value];
        // }

        // const specialCharHandler = (value: any, field: any) => {
        //     const cleanedValue = value?.toUpperCase();
        //     if (field === 'PAN No.') {
        //         const panNo = cleanedValue.replace(/[^A-Z0-9]/g, "");
        //         return panNo.length === 10 ? panNo : "";
        //     }
        //     if (field === 'Deductee Name') {
        //         return cleanedValue.replace(/[^A-Z0-9._ ]/g, "");
        //     }
        //     return cleanedValue;
        // };

        // let finalArr: any = [];
        // const headerArr = Object.keys(validationArr);
        // const begin = Date.now();
        // newArr.map((e: any, i: any) => {
        //     let arr = new Array(headerArr.length).fill("");
        //     headerArr.forEach((fieldName, colIndex) => {
        //         const fieldIndexInCsv = header.findIndex((h: any) => h === fieldName);
        //         let value = fieldIndexInCsv !== -1 ? (e[fieldIndexInCsv] || "").trim() : "";
        //         const dataType = validationArr[fieldName]?.["Data Type"];
        //         // value = dataType === "D" ? dateFormatHandle(value) : dataType === "C" ? (typeof value === "string" && value.trim() ? value.toUpperCase() : "") : dataType === "N" ? (!value || isNaN(Number(value)) ? 0 : Number(value)) : "";
        //         value = dataType === "D" ? dateFormatHandle(value) : dataType === "C" ? (typeof value === "string" && value.trim() ? specialCharHandler(value, fieldName) : "") : dataType === "N" ? (!value || isNaN(Number(value)) ? 0 : Number(value)) : "";
        //         if (fieldName === "Line Number") {
        //             arr[colIndex] = i + 1;
        //         } else {
        //             arr[colIndex] = value
        //         }
        //     });
        //     finalArr.push(arr);
        // })
        // const end = Date.now()
        // const durationMs = end - begin;
        // const minutes = Math.floor(durationMs / (1000 * 60));
        // const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
        // console.log(`TimeSpentFor convert== ${minutes} mins ${seconds} secs`);
        // if (!fs.existsSync(rootPath)) {
        //     fs.mkdirSync(rootPath, { recursive: true });
        // }
        // const data: any = await generateLargeJsonFile(finalArr, rootPath, req, token, `public/${fName}`);
        // console.log(data);

        // return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", stats: { procSeq: data?.procSeq, message: "File converted Successfully..." } });
    }
)
export { router as csvToJsonConvertor }