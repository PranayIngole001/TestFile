import Client from "ssh2-sftp-client";
import fs from 'fs';
import { isDownloadPathExist, isRootPathExist } from "./fileSystemHandler";
import os, { EOL } from 'os';

import { ORACLE_DB_IP, ORACLE_DB_IP_SSH_USERNAME, ORACLE_DB_IP_SSH_PASSWORD, ORACLE_DB_IP_SSH_PORT, CLOUD_INFRA_AT, ABSOLUTE_SFTP_IP, ABSOLUTE_SFTP_USERNAME, ABSOLUTE_SFTP_PASSWORD, ABSOLUTE_SFTP_PORT, FILE_TRANSFER_PROTOTCOL } from '../../config/envConfig';
import { s3Download } from "./s3Client";
import { littleLegs } from "../delay";
import { execute } from "../../config/db";


const config = (isAbsolute = false) => ({
    forceIPv4: false,
    forceIPv6: false,
    host: isAbsolute ? ABSOLUTE_SFTP_IP : ORACLE_DB_IP,
    username: isAbsolute ? ABSOLUTE_SFTP_USERNAME : ORACLE_DB_IP_SSH_USERNAME,
    password: isAbsolute ? ABSOLUTE_SFTP_PASSWORD : ORACLE_DB_IP_SSH_PASSWORD,
    port: parseInt(`${isAbsolute ? ABSOLUTE_SFTP_PORT : ORACLE_DB_IP_SSH_PORT}`),
    readyTimeout: 20000,
    strictVendor: true,
    retries: 2,
    retry_factor: 2,
    retry_minTimeout: 2000
})

export const sftpConnect = async (callback: any, isAbsolute = false) => {
    try {
        const sftp = new Client;
        await sftp.connect(config(isAbsolute));
        const res = await callback(sftp);
        await sftp.end();
        return res
    } catch (error) {
        console.error(error);
    }
}

export const putToSFTP = async (filePath: any, dir: any = ``) => {
    try {
        const res = await sftpConnect(async (sftp: any) => {
            const data = fs.createReadStream(`public/${filePath}`);
            const res = await sftp.put(data, `${dir}${os.platform() === 'win32' ? "\\" : "/"}${filePath}`);
            return res
        })
        return res
    } catch (error) {
        console.error(error);
    }
}


export const getFile = async (filePath: any, basePath: string = "", reqClone: any = null) => {
    try {
        await isRootPathExist(`${basePath}`);
        let resQuery: any = false
        if (CLOUD_INFRA_AT == "AWS" && reqClone) {
            resQuery = await execute(`SELECT rdsadmin.rdsadmin_s3_tasks.upload_to_s3(p_bucket_name => 'taxcpc-staging',p_prefix =>'${filePath.split("/").pop()}',p_s3_prefix =>'s3_dump/',p_directory_name => 'TDS_TEXT_FILES') AS TASK_ID FROM DUAL`, null, null, reqClone, "queryexecute")
            await littleLegs(4000);
            if (await s3Download({ fileName: `s3_dump/${filePath.split("/").pop()}`, filePath: `public/${basePath}/${filePath.split("/").pop()}` })) resQuery = true;
        }
        else if (FILE_TRANSFER_PROTOTCOL == "BLOB") {
            const procSeq: any = `${Math.floor(Math.random() * 1000000000)}`;
            // resQuery = await execute(`${basePath}${basePath ? "/" : ""}${filePath.split("/").pop()}`, procSeq, "TDS_TEXT_FILES", reqClone, "transferToDB");
            resQuery = await execute(`${basePath}${basePath ? "/" : ""}${filePath.split("/").pop()}`, procSeq, "TDS_TEXT_FILES", reqClone, "transferToDB");
            await execute(`DELETE FROM import_template_upload_file WHERE PROCESS_SEQNO=${procSeq}`, null, null, reqClone, "queryexecute");
        }
        else {
            resQuery = await sftpConnect(async (sftp: any) => {
                const res = await sftp.get(filePath);
                if (res && (basePath ? await isRootPathExist(basePath) : await isDownloadPathExist())) {
                    const resS = `${basePath ? `public/${basePath}/` : "public/download/"}${filePath.split(filePath.includes("\\") ? "\\" : "/").pop()}`
                    fs.writeFileSync(resS, res);
                    return resS;
                }
                return false;
            })
        }
        return resQuery;
    } catch (error) {
        console.error(error);
        return false
    }
}
