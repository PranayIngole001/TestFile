import { ok } from 'assert';
import { Request, Response, Router } from 'express';
import { currentUser } from '../middlewares/current-user';
import { requireAuth } from '../middlewares/require-auth';
import { validationRequest } from '../middlewares/validate-request';
import { DatabaseSideError } from '../errors/database-side-error';
import { moveReqFileFunction } from '../common/fileHandler';
import { PUBLIC_BASE_PATH, SEVEN_ZIP_PATH } from '../config/envConfig';
import { exec, execSync } from 'child_process';
import { slash } from '../common/bulkPrnHandler';
import * as fs from 'fs';
const util = require('util');
const execAsync = util.promisify(exec);

const router = Router();

router.post('/tds-to-xlsx-converter',
    async (req: Request, res: Response) => {
        const { fileNameOG } = req.body;
        const { files }: any = req?.files ?? {}
        console.log({ files });
        if (!files) throw new DatabaseSideError("FILE IS REQUIRED", 400);
        const fileId = files?.name.split(".").slice(0, -1).join(".");
        const saveRes: any = await moveReqFileFunction(files, `tdsFile/${files?.name}`, fileId);
        if (!saveRes) throw new DatabaseSideError("FAILED TO WRITE FILE", 400);

        !(await fs.existsSync(`public/tdsFile/${fileId}`)) && await fs.mkdirSync(`public/tdsFile/${fileId}`);
        let password = fileNameOG.split(".C_").pop()
        if(password?.includes(" ")){
            password = password?.split(" ")?.[0];
        }
        if(!fileNameOG?.includes(".C_")){
            console.log(fileNameOG, "fileNameOG this is it");
            return res.status(400).send({data:{ status: "FAILED", message: "Select a valid zip" }})
        }

        const zipcmd = process.platform == "win32"
            ? `"${SEVEN_ZIP_PATH}" t -p"${password}" "${PUBLIC_BASE_PATH}${slash}tdsFile${slash}${saveRes}"`
            : `"${SEVEN_ZIP_PATH}" t -p"${password}" "${PUBLIC_BASE_PATH}${slash}tdsFile${slash}${saveRes}"`;
        try {
            const out = execSync(zipcmd, { encoding: 'utf-8' });
            console.log(out, "this is out statement");
            if (!out.includes('Everything is Ok')) {
                if (out.includes('Wrong password')) {
                    return res.status(400).send({ data: { status: "FAILED", message: "The password is incorrect." } });
                }
                return res.status(400).send({ data: { status: "FAILED", message: "An error occurred with the ZIP file." } });
            }
        } catch (error) {
            console.error("Error during ZIP extraction:", error);
            return res.status(400).send({ data: { status: "FAILED", message: "Failed to extract ZIP file." } });
        }

        const unzipCmd = process.platform == "win32"
            ? `"${SEVEN_ZIP_PATH}" x -p"${password}" "${PUBLIC_BASE_PATH}${slash}tdsFile${slash}${saveRes}" -o"${PUBLIC_BASE_PATH}${slash}tdsFile${slash}${fileId}" -y`
            : `"${SEVEN_ZIP_PATH}" x -p"${password}" "${PUBLIC_BASE_PATH}${slash}tdsFile${slash}${saveRes}" -o"${PUBLIC_BASE_PATH}${slash}tdsFile${slash}${fileId}" -y`;

        console.log(unzipCmd, "unzipCmd");
        const resUnzip = await execAsync(unzipCmd);

        const tdsFile = (await fs.readdirSync(`${PUBLIC_BASE_PATH}${slash}tdsFile${slash}${fileId}`)).find((e) => e.endsWith(".tds"));
        if (!tdsFile) throw new DatabaseSideError("FAILED TO FIND TDS FILE", 400);

        // const cmd = `D:\\ExcelData\\Practice\\tdsToExcelConverterPython\\newScript.py  "${PUBLIC_BASE_PATH}tdsFile${slash}${fileId}${slash}${tdsFile}" "${PUBLIC_BASE_PATH}${slash}tdsFile${slash}${fileId}${slash}${fileId}"`;
        const cmd = `${process.platform == "win32" ? "python" : "python3"}  "${PUBLIC_BASE_PATH}tdsToXlsxConverterScript/final.py"  "${PUBLIC_BASE_PATH}tdsFile${slash}${fileId}${slash}${tdsFile}" "${PUBLIC_BASE_PATH}tdsFile${slash}${fileId}"`;
        console.log(cmd, "this is cmd");

        const resXlsx = await execAsync(cmd);
        console.log(resXlsx,"resXlsx");
        const xlsxFile = (await fs.readdirSync(`${PUBLIC_BASE_PATH}tdsFile${slash}${fileId}`)).find((e) => e.endsWith(".xlsx"));
        console.log(xlsxFile, "see this ")
        if(!xlsxFile){
            return res.status(400).send({status: "Failed", code: "Failed",  data:{ status: "Failed",message: "Failed to generate XLSX file. Please try again.", os: process.platform }})
        }
        
        return res.status(200).send({ status: "SUCCESS", code: "SUCCESS", message: "XLSX Generate Successfully", data:{ data:`public${slash}tdsFile${slash}${fileId}${slash}${fileId}.xlsx`, status: "SUCCESS", message: "Excel Generated Successfully", os: process.platform }});

    }
);
export { router as tdsToExcelRouter };