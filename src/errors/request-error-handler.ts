import { CustomError } from "./custom-error";
import { requestValidationError } from "../common/interface/jwt"

export class RequestErrorHandler extends CustomError {
    statusCode = 400

    constructor(public reqErrors: requestValidationError[] | string, statusCode: number = 400) {
        super('Error connection to database', statusCode);
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, RequestErrorHandler.prototype);
    }

    serializeErrors() {
        return Array.isArray(this.reqErrors) ? this.reqErrors.map(err => {
            return {
                message: err.message, field: err.field

            }
        }) :
            [
                {
                    message: this.reqErrors ? this.reqErrors : "Error in Request Body"
                }
            ];
    }

}