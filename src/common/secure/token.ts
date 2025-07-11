import { sign, verify } from 'jsonwebtoken';
import { JwtAuthData } from '../interface/jwt';
import dotenv from 'dotenv';
import { decrypt } from "../../config/aesHashToken";

dotenv.config();
const accessSecret = process.env.ACCESS_TOKEN_SECRET ? process.env.ACCESS_TOKEN_SECRET : '';
const refreshSecret = process.env.REFRESH_TOKEN_SECRET ? process.env.REFRESH_TOKEN_SECRET : '';
const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY ? process.env.ACCESS_TOKEN_EXPIRY : '8h';
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY ? process.env.REFRESH_TOKEN_EXPIRY : '12h';

export interface TokenObj {
    accessToken: string,
    refreshToken: string,
}

export async function generateTokens(payload: JwtAuthData) {
    return new Promise<TokenObj>((resolve, reject) => {
        try {
            const token = {
                accessToken: sign(payload, accessSecret, { expiresIn: accessTokenExpiry }),
                refreshToken: sign(payload, refreshSecret, { expiresIn: refreshTokenExpiry })
            }
            resolve(token);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    })
}

export async function validateRefreshToken(receivedToken: string) {
    return new Promise<string>((resolve, reject) => {
        try {
            let refreshToken: any = receivedToken;
            refreshToken = decrypt(refreshToken);
            const token: any = verify(refreshToken, refreshSecret, (err: any, payload: any) => {
                if (err) return "";
                const newPayload: any = payload;
                if (newPayload.iat) delete newPayload.iat;
                if (newPayload.exp) delete newPayload.exp;
                return sign(newPayload, accessSecret, { expiresIn: accessTokenExpiry });
            });
            resolve(token);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    })
}