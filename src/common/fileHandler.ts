import path from 'path';
import fs from 'fs';
import { PUBLIC_BASE_PATH } from '../config/envConfig';
import { slash } from './bulkPrnHandler';

export const moveReqFileFunction = async (reqFile: any, reqPath: any, fileName: any = '', fullPath = false) => {
    const fileUrl = await new Promise(function (fulfill, reject) {
        const file = fileName + path.extname(reqFile.name);
        console.log(reqPath, "reqPath");

        reqFile.mv(fullPath ? reqPath : `./public/${reqPath}` + "", (error: any) => {
            if (error) {
                console.log(error, "error");

                reject(false);
            }
            fulfill(file ?? true);
        })
    });
    console.log(fileUrl, "fileUrl");

    return (fileUrl) ?? '';
}
export const announcementFileUpld = async (reqFile: any, reqPath: any, fileName: any = '') => {
    const fileUrl = await new Promise(function (fulfill, reject) {
        const file = fileName;
        reqFile.mv(`./public/${reqPath}` + "", (error: any) => {
            if (error) {
                console.log(error)
                reject(false);
            }
            fulfill(file);
        })
    });
    return (fileUrl) ?? '';
}

export const instructionFileUpload = async (reqFile: any, reqPath: any, fileName: any = '', folderName: any = '') => {
    const folderPath = path.join('./public', folderName);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    if (fs.existsSync(folderPath)) {
        fs.readdir(folderPath, (err, files) => {
            if (err) {
                console.error('Error reading directory:', err);
                return;
            }
            files.forEach(file => {
                fs.unlinkSync(`${folderPath}/${file}`);
            });
        });

        const fileUrl = await new Promise(function (fulfill, reject) {
            const file = fileName;
            reqFile.mv(`./public/${reqPath}` + "", (error: any) => {
                if (error) {
                    reject(false);
                }
                fulfill(file);
            })
        });
        return (fileUrl) ?? '';
    }
    return null;
}

export const moveFileFunction = async (reqFile: any, reqPath: any) => {
    const fileUrl = await new Promise(function (fulfill, reject) {
        const fileName = Date.now() + path.extname(reqFile.name);
        reqFile.mv(`./public/${reqPath}` + "", (error: any) => {
            if (error) {
                reject(false);
            }
            fulfill(fileName);
        })
    });
    return (fileUrl) ? reqPath + fileUrl : '';
}

export const moveLogoFunction = async (reqFile: any) => {
    const fileUrl = await new Promise<string>(function (fulfill, reject) {
        // const fileName = Date.now() + path.extname(reqFile.name);
        const fileName = "brandLogo" + path.extname(reqFile.name);
        const destinationPath = `./public/brandlogo/${fileName}`;
        reqFile.mv(destinationPath, (error: any) => {
            if (error) {
                reject(false);
            } else {
                fulfill(fileName);
            }
        });
    });
    return fileUrl ? `/${fileUrl}` : '';
};


export const removeFile = async (reqPath: any) => {
    fs.unlink(`public/${reqPath}`, (err) => {
        if (err) {
            return
        }
    })
}

export const removeOlderFile = async (tdsPath: any) => {
    const dirPath = `${PUBLIC_BASE_PATH}/${tdsPath}`;    
    try {
        const files = await fs.promises.readdir(dirPath);
        console.log('Files and folders in the directory:', files);

        const currentTime = Date.now();
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            console.log(filePath, 'this is file Path')
            const stats = await fs.promises.stat(filePath);
            const fileAge = currentTime - stats.mtimeMs;
            const maxFileAge = 1000 * 60 * 60 * 24;
            if (fileAge > maxFileAge) {
                if (stats.isFile()) {
                    await fs.promises.unlink(filePath);
                    console.log(`Deleted file: ${filePath}`);
                } else if (stats.isDirectory()) {
                    await fs.promises.rmdir(filePath, { recursive: true });
                    console.log(`Deleted directory: ${filePath}`);
                }
            }
        }
    } catch (error) {
        console.error('Error reading the directory or deleting files:', error);
    }
};
