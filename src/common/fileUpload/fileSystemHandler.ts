import { Blob } from 'buffer';
import os, { EOL } from 'os';
import * as fs from 'fs-extra';
import path from 'path';
import SSH2Promise from 'ssh2-promise';
import { ORACLE_DB_IP, ORACLE_DB_IP_SSH_USERNAME, ORACLE_DB_IP_SSH_PASSWORD, ORACLE_DB_IP_SSH_PORT, FILE_BASE_PATH } from '../../config/envConfig';
import JSZip from 'jszip';
const util = require('util');
const { exec } = require('child_process');
const execAsync = util.promisify(exec);

// const { NodeSSH } = require('node-ssh')
// const nodessh = new NodeSSH();

const rootPath = `public/`;
const downloadPath = `public/download`;

export const isRootPathExist = (path: string = "") => new Promise<any>(async (resolve, reject) => {
    try {
        !await fs.existsSync("public") && await fs.mkdirSync('public', {
            recursive: true
        });
        path && !await fs.existsSync(`public/${path}`) && await fs.mkdirSync(`public/${path}`, {
            recursive: true
        });
        resolve(true);
    } catch (e) {
        console.error(e);
        reject(false);
    }
})

export const isDownloadPathExist = (path = null) => new Promise<any>((resolve, reject) => {
    try {
        !fs.existsSync(`public/${path ?? "download"}`) && fs.mkdirSync(`public/${path ?? "download"}`, {
            recursive: true
        });
        resolve(true);
    } catch (e) {
        console.error(e);
        reject(false);
    }
})

export const isFileExist = (path: any, realtivePath = true) => new Promise<any>(async (resolve, reject) => {
    try {
        return resolve(await fs.existsSync(`${realtivePath ? "public/" : ""}${path}`));
    } catch (e) {
        console.error(e);
        return reject(false);
    }
})

export const fileStats: any = (path: any) => new Promise<any>(async (resolve, reject) => {
    try {
        if (!isFileExist(path)) return resolve(false);
        resolve(await fs.statSync(`public/${path}`));
    } catch (e) {
        console.error(e);
        resolve({});
    }
})

export const renameFile = async (from: string, to: string) => new Promise<any>(async (resolve) => {
    try {
        const sourcePath = path.join(rootPath, from);
        const destinationPath = path.join(rootPath, to);
        await fs.copyFileSync(sourcePath, destinationPath);
        // await fs.removeSync(sourcePath);
        resolve(to);
    } catch (err) {
        console.error('Error renaming file:', err);
        resolve(false);
    }
})

export const writeFile = (file: any, fileName: string) => new Promise<any>(async (resolve, reject) => {
    try {
        if (await isRootPathExist()) fs.writeFileSync(`${rootPath}/${fileName}`, file, { encoding: 'base64' });
        resolve(true);
    } catch (e) {
        console.error(e);
        reject(false);
    }
})

export const writeFileAsync = (file: any, fileName: string, isDownloadPath = true) => new Promise<any>(async (resolve, reject) => {
    try {
        if (await isDownloadPathExist()) fs.writeFileSync(`${isDownloadPath ? downloadPath : rootPath}/${fileName}`, file);
        resolve(true);
    } catch (e) {
        console.error(e);
        reject(false);
    }
})

export const appendFile = (file: any, fileName: string) => new Promise<any>(async (resolve, reject) => {
    try {
        if (await isRootPathExist()) fs.appendFileSync(`${rootPath}${fileName}`, file, { encoding: 'base64' });
        resolve(true);
    } catch (e) {
        console.error(e);
        reject(false);
    }
})

export const removeFile = (fileName: string) => new Promise<any>(async (resolve, reject) => {
    try {
        console.log(`${rootPath}/${fileName}`);

        if (fs.existsSync(`public/${fileName}`)) fs.unlinkSync(`${rootPath}/${fileName}`);
        resolve(true);
    } catch (e) {
        console.error(e);
        reject(false);
    }
})

export const extractZipOS = async (zip: any, dest: any) => {
    const command = process.platform === 'win32' ? `powershell Expand-Archive -Path "${FILE_BASE_PATH}${zip.replace("/", "\\")}" -DestinationPath "${FILE_BASE_PATH}${dest.replace("/", "\\")}" -Force` : `unzip -o "${FILE_BASE_PATH}${zip}" -d "${FILE_BASE_PATH}${dest}"`;
    const resZip = await execAsync(command);
}

export const extractZip = (fileName: string, completePath = false) => new Promise<any>(async (resolve, reject) => {
    try {
        if (!fs.existsSync(completePath ? fileName : `public/${fileName}`)) return resolve(false);
        const zip = new JSZip();
        const zipContents = await zip.loadAsync(fs.readFile(completePath ? fileName : `public/${fileName}`));
        const getFileName = Object.keys(await zipContents.files)?.length ? Object.keys(await zipContents.files)[0] : "";
        fs.writeFileSync(`${rootPath}/${getFileName}`, await zipContents.files?.[getFileName].async('nodebuffer'));
        !completePath && fs.unlinkSync(`${rootPath}/${fileName}`);
        return resolve(getFileName);
    } catch (e) {
        console.error(e, "fdsdfds");
        if (process.platform != "win32") {
            let { stdout, stderr } = await execAsync(`unzip -ql "${completePath ? "" : FILE_BASE_PATH}${fileName}"  | awk '{print $NF}'`);
            console.log(`unzip -ql "${completePath ? "" : FILE_BASE_PATH}${fileName}"  | awk '{print $NF}'`, "FILE_BASE_PATH");

            stdout = `${stdout}`.split("\n")
            console.log(stdout, "stdoutdsdfds 131");

            console.log(stdout?.[2], "fdsfdsfds 133");
            if (!(`${stdout?.[2]}`.includes("."))) return reject(false);
            stdout = stdout?.[2];
            console.log(stdout, "stdout");
            console.log(`unzip -o "${completePath ? "" : FILE_BASE_PATH}${fileName}" -d "${FILE_BASE_PATH}"`);

            let { stdout: out, stderr: err } = await execAsync(`unzip -o "${completePath ? "" : FILE_BASE_PATH}${fileName}" -d "${FILE_BASE_PATH}"`);
            console.log({ out, err }, "unzip");


            // exec(`unzip -o "${FILE_BASE_PATH}${fileName}" -d "${FILE_BASE_PATH}"`, (error:any, stdout:any, stderr:any) => {
            //   if (error) {
            //     console.error(`Error executing command: ${error}`);
            //     return;
            //   }
            //   console.log(`stdout: ${stdout}`);
            //   console.error(`stderr: ${stderr}`);
            // });
            resolve(stdout);







            // console.log(stdout, "stdout", `unzip -o "${FILE_BASE_PATH}${fileName}" -d "${FILE_BASE_PATH}"`);
            // exec(`unzip "${FILE_BASE_PATH}${fileName}" -d "${FILE_BASE_PATH}"`,(e:any,r:any)=>{
            //     console.log({e,r});
            //     console.log(stdout,"stdout");
            //     // resolve(stdout);
            // });
        }
        // reject(false);
    }
})

export const mvZipSSH = async (zipPath: any, filePathObj: any, bulkZip = false) => new Promise<any>(async (resolve, reject) => {
    try {
        let tempDir: any = null;
        const { FVU_TEXT_IMPORT_ZIP, FVU_TEXT_IMPORT } = filePathObj;
        if (!FVU_TEXT_IMPORT_ZIP || !FVU_TEXT_IMPORT) throw `FVU_TEXT_IMPORT_ZIP, FVU_TEXT_IMPORT = ${FVU_TEXT_IMPORT_ZIP}, ${FVU_TEXT_IMPORT} is null`
        const workingDir: any = FVU_TEXT_IMPORT_ZIP;
        const unzipingDir: any = FVU_TEXT_IMPORT;

        const fileName = path.basename(zipPath, path.extname(zipPath));
        let zipFilePath = path.join(`${workingDir}`, `${zipPath}`).replace(/\\/g, '/');
        zipFilePath = os.platform() === 'win32' ? zipFilePath.replace(new RegExp("/", "g"), `\\`) : zipFilePath;

        const unzipFilePath = path.join(`${unzipingDir}`, ``).replace(/\\/g, '/');
        const sshClient = new SSH2Promise({
            host: ORACLE_DB_IP,
            username: ORACLE_DB_IP_SSH_USERNAME,
            password: ORACLE_DB_IP_SSH_PASSWORD,
            port: parseInt(`${ORACLE_DB_IP_SSH_PORT}`)
        });

        await sshClient.connect();

        const testCommand = os.platform() === 'win32' ? `if exist "${zipFilePath}" (echo true)` : `test -f ${zipFilePath} && echo "true"`;
        const existRes: any = await sshClient.exec(testCommand);

        if (existRes.replace(/(\r\n|\n|\r)/gm, "") !== "true") resolve({ status: false, desc: "Zip Not Found" });


        if (bulkZip) {
            if (os.platform() === 'win32') {
                try {

                    tempDir = `v${(Math.random() + 1).toString(36).substring(2)}`;
                    const unzipCommand = `${zipFilePath.split(":")[0]}:/7za.exe x "${zipFilePath}" -o"${workingDir}\\${tempDir}" -Y`;
                    console.log({ unzipCommand });

                    await sshClient.exec(unzipCommand);

                    let getFileName = await sshClient.exec(`powershell -command "Get-ChildItem -Path '${workingDir}\\${tempDir}' -Name"`);
                    console.log({ getFileName });
                    getFileName = getFileName.split('\n')[0];
                    console.log({ getFileName });
                    getFileName = getFileName.replace(new RegExp("\r", "g"), ``);
                    console.log({ getFileName });

                    await sshClient.exec(`powershell -command "Get-Item –Path '${workingDir}\\${tempDir}\\${getFileName}' | Move-Item -Destination '${unzipingDir}\\${tempDir}.${getFileName.split('.').pop()}'"`);

                    await sshClient.exec(os.platform() === 'win32' ? `del ${workingDir}\\${tempDir} /Q` : `rm -rf ${zipFilePath}`);
                    await sshClient.exec(os.platform() === 'win32' ? `rd ${workingDir}\\${tempDir}` : `rm -rf ${zipFilePath}`);

                    tempDir = `${tempDir}.${getFileName.split('.').pop()}`;
                } catch (error) {
                    console.log(error, "187");

                }
            }

        } else {
            const unzipCommand = os.platform() === 'win32' ? `powershell -command "Expand-Archive -Path '${zipFilePath}' -DestinationPath '${unzipFilePath}'"` : `unzip ${zipFilePath} -d ${unzipFilePath}`;
            await sshClient.exec(unzipCommand);
        }
        // const removeCommand = os.platform() === 'win32' ? `del "${zipFilePath}"` : `rm -rf ${zipFilePath}`;

        // await sshClient.exec(removeCommand);

        resolve({ status: true, tempDir, desc: "UnZIP Succesfully" })

    } catch (e) {
        console.error(e);
        reject(false);
    }
})


export const genChunkPayload = (path: any, idx: any) => new Promise<any>(async (resolve, reject) => {
    try {
        if (!(await isFileExist(path))) return resolve(false);

        const buffer = fs.readFileSync(`public/${path}`);
        const blob: any = new Blob([buffer]);
    } catch (e) {
        console.error(e);
        reject(false);
    }
})