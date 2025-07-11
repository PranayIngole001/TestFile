import { Request, Response, Router } from 'express';
import { currentUser } from '../../middlewares/current-user';
import { requireAuth } from '../../middlewares/require-auth';
import sCode from '../../common/status-codes';
import { execute } from '../../config/db';
import { DatabaseSideError } from '../../errors/database-side-error';
import { bodySanitizerValidator } from '../../middlewares/bodySanitizerValidator';
import { DEBUG_DB } from '../../config/envConfig';
import validateSqlInjection from '../../middlewares/validateSqlInjection';
import { sDataWriter } from '../../common/sDataWriter';
import { ALL } from 'dns';
const { ok } = sCode;
const { FORMAL_DB_RECORDS } = process.env;


const router = Router();
router.post(`/get-default-data/:type`,
    [currentUser, requireAuth],
    validateSqlInjection,
    bodySanitizerValidator('get_gtfb_tds_justification_tran_summ', ALL),
    async (req: Request, res: Response) => {
        if (req?.currentUser !== undefined) {
            const { type } = req.params;
            const { iud_seqno, current_records } = req.body;
            const procType = type;
            const filterClause = JSON.stringify(req.body.filter ?? []);
            var sdata = sDataWriter(req, iud_seqno,
                `
                "a_process_seqno":"",
                "a_proc_type":"${procType}",
                "a_proc_error":"0",
                "a_process_status_code": "ZA",
                "a_db_total_records":"${FORMAL_DB_RECORDS}",
                "a_pagination_count":"${current_records ?? ""}",
                "a_page_from":"1",                 
                "a_page_to":"1",
                "a_filter_clause": ${filterClause}
                `);
            console.log(sdata, "sdata")
            const result: any = await execute(`BEGIN PKG_TAXCPC_APP.PROC_CALL_MAIN_INOUT(session_seqno_replace, iud_seqno_replace,:a_in_parameter_json,:a_out_parameter_json,'${req?.currentUser.user_code}');END;`, sdata, procType, req);



            if (!result && DEBUG_DB) throw new DatabaseSideError("RESULT IS NULL", 400);
            // return res.status(ok).send({ status: "SUCCESS", code: "SUCCESS", clientCodes: result, message: "Header master data." });
            const { data, desc, errors, error_message, a_process_seqno, proc_type, ogResData } = result;

            if (errors) {
                if (errors.length) {
                    throw new DatabaseSideError(errors, 400);
                }
                throw new DatabaseSideError(error_message, 400);
            }

            const { [`${procType}_header`]: header, [`${procType}_detail`]: detail } = data;

            return res
                .status(ok)
                .send({
                    status: "SUCCESS",
                    code: "SUCCESS",
                    [procType]: procType.includes("dg") ? data[0] : {
                        detail,
                        header,
                        ogResData
                    },
                    message: desc
                });
        }
    }
);
export { router as getDefaultDataRouter };