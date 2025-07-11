import { Request, Response, Router } from 'express';
import sCode from '../common/status-codes';
import { callApi } from './processLogSequenceCancel';
import { f16FileTran, frm16StatApi, procMsg, rmPid } from '../common/form16Handler';

const { ok, server_error } = sCode;
const router = Router();

router.post('/f16-status-job', async (req: Request, res: Response) => {
    try {
        const { reqClone, statusFlag, seqNo, validTan, pdf_count, procId, token } = req.body;

        if (procId) {
            if (typeof procId !== 'boolean') {
                return res.status(server_error).send({ status: "ERROR", message: "Invalid procId value" });
            }
            console.log('Processing with procId:', procId);
            await rmPid({ token });
            return res.status(ok).send({ status: "SUCCESS", message: "Processing with procId" });
        } else {
            if (!reqClone || !statusFlag || !seqNo || !validTan || pdf_count == undefined) {
                return res.status(server_error).send({ status: "ERROR", message: "Missing required fields" });
            }
            const storedReq = JSON.parse(reqClone);
            const homeorigin = storedReq.headers?.homeorigin ?? storedReq.headers?.Homeorigin;

            // await procMsg({
            //     req,
            //     queryMsg: `declare l_local_proc_error_w varchar2(1000); BEGIN pkg_tds_imp_template.proc_process_log_file_w('${seqNo}','A','PDF Generation is stated coe afer few hours...',l_local_proc_error_w);END;`
            // });

            await f16FileTran({
                onProc: "3",
                req: storedReq,
                matchingZipPass: validTan,
                pdf_count: pdf_count.trim(),
                statFlag: ""
            });

            await callApi({
                headers: { ...storedReq.headers, homeorigin },
                body: {
                    ...storedReq.body,
                    processIudType: "STATUS_UPDATE",
                    process_status_code_fixed: statusFlag,
                    process_seqno: storedReq.body.process_seqno,
                    process_status_code: storedReq.body.process_status_code,
                    uploadType: storedReq.body.uploadType
                },
                currentUser: { ...storedReq.currentUser, homeorigin }
            });

            await frm16StatApi(storedReq, !!reqClone.length);

            return res.status(ok).send({ status: "SUCCESS", message: "Completed..." });
        }


    } catch (error) {
        console.error('Error:', error);
        return res.status(server_error).send({ status: "ERROR", message: error.message });
    }
});

export { router as f16FileTranRouter };
