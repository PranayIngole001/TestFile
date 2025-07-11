import CryptoJS from "crypto-js";

const iv = "00000000000000000000000000000000";
const salt = "00000000000000000000000000000000";
const keySize = 128;
const iterationCount = 10000;
const passPhrase = "aesalgoisbestbes";

const generateKey = function () {
    return CryptoJS.PBKDF2(
        passPhrase,
        CryptoJS.enc.Hex.parse(salt),
        { keySize: keySize / 32, iterations: iterationCount });
}

const encrypt = (plainText: string) => {
    const key = generateKey();
    const encrypted = CryptoJS.AES.encrypt(
        plainText,
        key,
        { iv: CryptoJS.enc.Hex.parse(iv) });
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
}

const decrypt = function (cipherText: string) {
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