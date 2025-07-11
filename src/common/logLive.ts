import { spawn, execSync } from 'child_process';


declare global {
    var activeInteractiveConsoleIt: {
        socketClient: any,
        console: any
    }
}


const interactiveConsole = (cmd: any, ws: any) => {
    global.activeInteractiveConsoleIt.socketClient = ws;
    // console.log(!!global.activeInteractiveConsoleIt?.console);

    if (global.activeInteractiveConsoleIt?.console) return global.activeInteractiveConsoleIt.console.stdin.write(cmd + '\n');

    const child = spawn('cmd.exe', ['/K']);
    // console.log(`PROCESS PID: ${child.pid}`);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (data) => {
        // console.log(`Process output: ${data}`);
        global.activeInteractiveConsoleIt.socketClient.send(data);
    });

    child.stderr.on('data', (data) => {
        // console.error(`Process error: ${data}`);
        global.activeInteractiveConsoleIt.socketClient.send(data);
    });

    child.stdin.write(cmd + '\n');
    global.activeInteractiveConsoleIt.console = child;
    child.on('close', (code) => {
        activeInteractiveConsoleIt = { socketClient: null, console: null };
        // console.log(`Persistent process exited with code ${code}`);
    });
}

export const logLive = (command: string, args: string[], ws: any) => {
    global.activeInteractiveConsoleIt = { ...(global.activeInteractiveConsoleIt) };
    if (!command.includes("pm2")) return interactiveConsole(command + " " + args.join(" "), ws)
    try {
        const child:any = spawn(command, args, {
            shell: true
        });
        // console.log(`Started persistent process with PID: ${child.pid}`);

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (data: string) => {
            // console.log(`Process output: ${data}`);
            ws.send(data.toString());
        });
        child.stderr.on('data', (data: string) => {
            console.error(`Process error: ${data}`);
            ws.send(data.toString());
        });

        child.on('close', (code: number) => {
            // console.log(`Persistent process exited with code ${code}`);
        });
        ws.on('message', (message: string) => {
            // console.log(`Received command: ${message}`);
            if (child) {
                child.stdin.write(`${message}\n`);
            } else {
                ws.send('Persistent process is not running.');
            }
        });

        ws.on('close', async () => {
            // console.log('WebSocket closed. The persistent process remains running.');
            // console.log(` PID: ${child.pid}`);
            if (process.platform != "win32") {
                // execSync(`ps -p ${pid}`, (_) => { (!_.split('\n').length <= 2) ? execSync(`kill -15 ${cPid}`) : return; });
                // console.log(`kill -15 ${child.pid}`, "checkCmdHl");
                const resClose = await execSync(`kill -15 ${child.pid}`);
                if (!child.exitCode && typeof child.kill === 'function') { child.kill(); }
                const count = await execSync(`ps aux | wc -l`);
                // console.log(count.toString(), "count");
                // console.log(resClose.toString(), "res chk");
            } else {
                const hostT: any = await execSync(`wmic process where (ParentProcessId=${child.pid}) get ProcessId,CommandLine /value`, { encoding: 'utf-8' }).match(/ProcessId=(\d+)/)?.[1];
                const host = parseInt(hostT);
                if (await execSync(`tasklist /fi "pid eq ${host}"`).toString().includes("No tasks are running")) return;
                execSync(`taskkill /F /PID ${host}`);
                if (await execSync(`tasklist /fi "pid eq ${child.pid}"`).toString().includes("No tasks are running")) return;
                execSync(`taskkill /F /PID ${child.pid}`);
                if (!child.exitCode && child?.close) child?.close?.();
            }
        });
    } catch (error) {
        console.error('Error:', error);
        ws.send(`Error: ${error.message}`);
    }
};
