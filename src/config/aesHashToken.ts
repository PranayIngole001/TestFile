import CryptoJS from "crypto-js";
import { config as loadEnvironmentVariable } from 'dotenv';
// load envirnment variables
loadEnvironmentVariable();

const { AESHASH_IV, AESHASH_SALT, AESHASH_PASS_PHRASE } = process.env;

const iv = `${AESHASH_IV}`;
const salt = `${AESHASH_SALT}`;
const keySize = 256;
const iterationCount = 10;
const passPhrase = `${AESHASH_PASS_PHRASE}`;

const generateKey = function () {
    return CryptoJS.PBKDF2(
        passPhrase,
        CryptoJS.enc.Hex.parse(salt),
        { keySize: keySize / 32, iterations: iterationCount });
}

const encrypt = (plainText:string) => {
    const key = generateKey();
    const encrypted = CryptoJS.AES.encrypt(
        plainText,
        key,
        { iv: CryptoJS.enc.Hex.parse(iv) });
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
}

const decrypt = function (cipherText:string) {
    const key = generateKey();
    const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Base64.parse(cipherText)
    });

    try {
        const decrypted = CryptoJS.AES.decrypt(
            cipherParams,
            key,
            { iv: CryptoJS.enc.Hex.parse(iv) });
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        
        return false;
    }

}

export default encrypt
export { encrypt, decrypt }