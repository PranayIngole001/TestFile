import chokidar from "chokidar";
import { exec, execSync, spawn } from "child_process";
import fs from "fs";
import {
  DC_WATCH_PATH,
  MINIO_BUCKET_NAME,
  MINIO_EXEC_PATH,
  MINIO_STORAGE_PATH,
  WATCH_POOL,
} from "../config/envConfig";
const util = require("util");
const execAsync = util.promisify(exec);
declare global {
  var minIOProcessInfo: {
    queue: {
      status: "ACTIVE" | "QUEUE";
      cb?: () => any;
      minCmd: string;
    }[];
    [key: string | number]: any;
  };
}
const watchDC: any[] =
  DC_WATCH_PATH?.split(",")
    ?.map((e: any) => e?.replaceAll("\\\\", "\\")?.trim())
    ?.filter((e: String) => e != "") ?? [];
const runMinio = async (cmd: any) => {
  return new Promise(async (res) => {
    try {
      const execRes = await execAsync(cmd);
      res(true);
    } catch (e) {
      console.log(e, "ERR");
      res(false);
    } finally {
      const getCurrentProcIdx = global.minIOProcessInfo?.queue.findIndex(
        (e: any) => e?.minCmd == cmd && e?.status == "ACTIVE"
      );
      global.minIOProcessInfo.queue = global.minIOProcessInfo.queue.filter(
        (e: any, i: any) => i != getCurrentProcIdx
      );
      const anyProcInQueueIdx = global.minIOProcessInfo.queue.findIndex(
        (e: any) => e?.status == "QUEUE"
      );
      if (anyProcInQueueIdx != -1) {
        global.minIOProcessInfo.queue[anyProcInQueueIdx] = {
          ...(global.minIOProcessInfo.queue[anyProcInQueueIdx] ?? {}),
          status: "ACTIVE",
        };
        global.minIOProcessInfo.queue[anyProcInQueueIdx]?.cb?.();
      }
    }
  });
};
const getCmd = async ({ e, bucketName, minIOdestination, path }: any) => {
  if (e == "add") {
    return `"${MINIO_EXEC_PATH}mc" cp "${path}" "minio1/${bucketName}/${minIOdestination}"`;
  }
  if (e == "unlink") {
    return `"${MINIO_EXEC_PATH}mc" rm "minio1/${bucketName}/${minIOdestination}"`;
  }
  if (e == "change") {
    return `"${MINIO_EXEC_PATH}mc" rm "minio1/${bucketName}/${minIOdestination}" && "${MINIO_EXEC_PATH}mc" cp "${path}" "minio1/${bucketName}/${minIOdestination}"`;
  }
};
const minioStart = () => {
  const minPath = `${MINIO_EXEC_PATH}minio.exe`;
  const minioProcess = spawn(minPath, ["server", MINIO_STORAGE_PATH], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  minioProcess.on("exit", (code) => {
    if (code !== 0) {
      minioStart();
    } else {
      console.log(`MinIO process exited successfully.`);
    }
    minioProcess.unref();
  });
};
export const WatchMinIO = async () => {
  try {
    global.minIOProcessInfo = {
      queue: [...(global.minIOProcessInfo?.queue ?? [])],
    };
    const f16Paths = fs.existsSync('D:/taxcpc1/cached.json') ? JSON.parse(fs.readFileSync('D:/taxcpc1/cached.json', 'utf8'))?.GKK?.get_gmdt_app_parameters?.filter((e: any) => e.parameter_name === "FORM_16_PDF_FILE_PATH" && Object.values(JSON.parse(e.value))) : [];
    const pushInDc = Object.values(JSON.parse(f16Paths[0].parameter_value)).map((path: any) => path.replace(/\\\$.*$/, ''))
    watchDC.push(...pushInDc)
    minioStart();
    if (!watchDC?.length) {
      return;
    }
    for (let p = 0; p < watchDC.length; p++) {
      ["add", "change", "unlink"]?.forEach((e) => {
        chokidar
          .watch(watchDC[p], {
            ignored: /node_modules/,
            ignoreInitial: true,
            persistent: true,
          })
          ?.on(e, async (path) => {
            let minIOdestination = path
              ?.replace(`${watchDC[p].split(":")[0]}`, "")
              .replace(":", "");
            minIOdestination = minIOdestination?.replaceAll("\\", "/");
            let srcPath = path?.replace("/", "");
            let MainminIOdestination = minIOdestination?.replace("/", "");
            const minCmd = await getCmd({
              e,
              bucketName: MINIO_BUCKET_NAME,
              minIOdestination: MainminIOdestination,
              path: srcPath,
            });
            if (!minCmd) return;
            if (
              !(
                global.minIOProcessInfo?.queue.filter(
                  (e: any) => e?.status == "ACTIVE"
                )?.length >= WATCH_POOL
              )
            ) {
              global.minIOProcessInfo?.queue.push({
                status: "ACTIVE",
                minCmd,
              });
              await runMinio(minCmd);
            } else {
              global.minIOProcessInfo?.queue.push({
                status: "QUEUE",
                minCmd,
                cb: async () => await runMinio(minCmd),
              });
            }
          });
      });
    }
  } catch (e) {
    console.log(e, "watchItERR");
  }
};