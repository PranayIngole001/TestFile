

export const sDataWriter = ({ currentUser, body }: any, iud_seqno: any, obj: any, { month, toMonth, fromMonth }: any = { month: undefined, toMonth: undefined, fromMonth: undefined }) => {
    return `{
        "a_session_seqno": "session_seqno_replace",
            "a_iud_seqno": "iud_seqno_replace",
            ${body?.apppendSdata ?? ""}
            "a_is_pen_flag":"${currentUser?.is_pen_flag ?? ""}",
            "a_login_type": "${currentUser.iud_type ?? ""}",
            "a_module_type_code":"${currentUser.default_module_type_code ?? ""}",
            "a_sub_module_type_code":"${currentUser.default_sub_module_type_code ?? ""}",
            "a_entity_code": "${currentUser.entity_code}",
            "a_client_code": "${currentUser.client_code}",
            "a_acc_year": "${currentUser.default_acc_year}",
            "a_quarter_no": "${currentUser.default_quarter_no}",
            "a_tran_month": "${month ? month : currentUser.default_tran_month}",
            "a_tran_from_date": "${fromMonth ? fromMonth : currentUser.default_from_date}",
            "a_tran_to_date": "${toMonth ? toMonth : currentUser.default_to_date}",
            "a_tds_type_code": "${currentUser.default_tds_type_code}",
            "a_validation_client_level":"${currentUser.client_code_level ?? ''}",
             "a_first_level_client_code": "${currentUser.first_level_client_code ?? ""}",
            ${obj}
           
        }`
}