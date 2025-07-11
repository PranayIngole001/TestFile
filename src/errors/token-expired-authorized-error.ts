import { CustomError } from "./custom-error";

export class TokenExpiredUnauthorizedError extends CustomError {
    public statusCode = 401;

    constructor(public field: string, public message: string) {
        super('TokenExpiredError', 401);
        Object.setPrototypeOf(this, TokenExpiredUnauthorizedError.prototype);
    }

    serializeErrors() {
        return [{ message: this.message, field: this.field }];
    }
}
