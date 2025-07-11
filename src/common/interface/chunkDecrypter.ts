import EncryptRsa from 'encrypt-rsa';
import CryptoJS from 'crypto-js';

const publicKey = '-----BEGIN PUBLIC KEY-----\n' +
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvY1CrtBbSgFvPxvqPiY7\n' +
    'NWFpAQ9Ophrclel/KOlo6WeLA14qtdAFIc4BD5O6o9GXymBIAMAVykO9DT6F35HO\n' +
    'esvzYdlM/XL98GS2Ufk85gWsfKSwd38Heh8FmnGDJvYamwAccaAG77X2VaB1YznS\n' +
    'mv0GhVObCcZukhpiqF8wsUJPpynSW6pSLEYrnX8DgM9ZyPRsTp8agEI+nW1D33fs\n' +
    'MWkfu9gKB/NprQlMeF0y6LFjTKYG+ukQJ2rqPk5mGS+q1OQT3xrFnxCErM7bVVXJ\n' +
    'siWDV0bkyTKbTS7bSyTc8n4jN09OPujwp28olKH9O37dcdAyZn8APXvFpBpgQL8E\n' +
    'eQIDAQAB\n' +
    '-----END PUBLIC KEY-----\n';

const privateKey = '-----BEGIN PRIVATE KEY-----\n' +
    'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC9jUKu0FtKAW8/\n' +
    'G+o+Jjs1YWkBD06mGtyV6X8o6WjpZ4sDXiq10AUhzgEPk7qj0ZfKYEgAwBXKQ70N\n' +
    'PoXfkc56y/Nh2Uz9cv3wZLZR+TzmBax8pLB3fwd6HwWacYMm9hqbABxxoAbvtfZV\n' +
    'oHVjOdKa/QaFU5sJxm6SGmKoXzCxQk+nKdJbqlIsRiudfwOAz1nI9GxOnxqAQj6d\n' +
    'bUPfd+wxaR+72AoH82mtCUx4XTLosWNMpgb66RAnauo+TmYZL6rU5BPfGsWfEISs\n' +
    'zttVVcmyJYNXRuTJMptNLttLJNzyfiM3T04+6PCnbyiUof07ft1x0DJmfwA9e8Wk\n' +
    'GmBAvwR5AgMBAAECggEBALjgu6Zn4HI5Hfkuz/SYM22oOdNny60lS/sHyBfuOH5W\n' +
    'mHbLdNrqLuc+1zgLPaIkfmlMKU5aC6bBFPaDAe4Cd6K7pAHPAVG+w8GhaVZgwy4T\n' +
    'YJ4dv2R9yJwq/7sYdfQdW+vMWvHURI+vKblwjK4gKrMykRafaftJyHTGOW3Bkmt/\n' +
    '8noHvyB5Y9gYlrDu0BF8ANKPPnmkaasxZwaZeQGr/wkQbcvspyzjRZa67AhOGZgl\n' +
    'bI+5J3SeTQ/1G3nkBYtKMWF+2oL0A9yIWCWvNvgqY/d+Cs4ezmOb/3DQLTBCQnQk\n' +
    'iS1M8bpN/GY5/RhgKy67MJJeCElgZsc/eXMGCfQ9LgECgYEA9hB2ba0jx/JIDm95\n' +
    'Yp4sNPqJBD7cJBZvqwOiOo2RPLRfy3rIJ8FWQ6/4nAM+9nTpOFRL2flLHhfELAgy\n' +
    'et4jVNWiRxl3ks3pGpNMfMVIkTfAnb3bm0RJhaYO3Q4ctFSp76oxtYtnQ+SAozOj\n' +
    '2UMp5jp2J7e9rFZPF/p0AyeYljkCgYEAxTSigwa8gmD/wcHAFSXKuTD0+N9uLDKE\n' +
    'nIgiISYVQI0eUdBQJZWym+XoFIIRzygIRrIdXCpaK9HEKmSVnYeNOnTTQWJ+NaeB\n' +
    'd4YrgOhW1LkzGirjYaKiNXoUMtRfdaZmR8jsycLBJ4Yt3rMd9y7jxtmsdfo5wHRU\n' +
    '7eRZLjQH4EECgYBSTttugHXxkgesXHl8FXCwIAXpF6XHpIGh8Ms5TtWAOs24YM/H\n' +
    'DJLwfVJpzWQoSJ8iqn/c39jSrhx+phdMpjWnUPbBVbF7t8j7jL4PFmbZvI5/tVxa\n' +
    'KZN2Uz+xjeDoKVHWy1VpZsIaIbst3D44lJDVZETVsE6P8Sbv3GUmEP6ncQKBgDZR\n' +
    'GA3k1hlHJEq21fQ9M4gsntzJlavgwjvnFxdwSNw9wkMgkGK5x7c+7NxxMvyO9zCZ\n' +
    'sJKJK8rz/Qb8K2V3R4P5V5Kj0UVv/K3yK5tW40u2MwgbFgP3apw2IsgZTK24BmXx\n' +
    'Rp8P4GnFgG7dgPxrUtubavAX2r5SjG31vkaGmEDBAoGBAIUGB80+vSs4mw5XZnqf\n' +
    'Z7TWVd7ivcIncX4MamUb587IfpUL1+uq60qDJ8//c7QUZw1K/+hMN+gsyMHhTkD5\n' +
    '2nxl+O7ywZtvm3hOtDwEIV1xMG3XQpHBS0wzdgcEKjXzg2zMBbqq4fgu9bV2GxLg\n' +
    'BNfJ6ZHeGgzpCT4MnTNMRDs9\n' +
    '-----END PRIVATE KEY-----\n'

const toSHA256 = async (base64String: string) => {
    return CryptoJS.SHA256(base64String).toString(CryptoJS.enc.Hex);
};

const toAESEncrypt = async (base64String: string) => {
    const aesKey = [...Array(64)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("")
        .toUpperCase();
    const iv: any = "00000000000000000000000000000000";
    const encryptedValue = await CryptoJS.AES.encrypt(base64String, aesKey, {
        iv: iv,
    }).toString();
    return { aesKey, encryptedValue };
};



export const payloadEncrypter = async (stringifiedJSON: any) => {
    // return new Promise(async (resolve, reject) => {
    //     const sha256Hashed: any = await toSHA256(stringifiedJSON);
    //     const { aesKey, encryptedValue } = await toAESEncrypt(stringifiedJSON);
    //     const { rsaEncryptedAESKey, rsaEncryptedHashed } = await toRSAEncrypt(
    //         aesKey,
    //         sha256Hashed
    //     );
    //     resolve({ encryptedValue, rsaEncryptedAESKey, rsaEncryptedHashed });
    // });
    const sha256Hashed = await toSHA256(stringifiedJSON);
    const { aesKey, encryptedValue } = await toAESEncrypt(stringifiedJSON);
    const { rsaEncryptedAESKey, rsaEncryptedHashed } = await toRSAEncrypt(aesKey, sha256Hashed);
    return { encryptedValue, rsaEncryptedAESKey, rsaEncryptedHashed };
};


const toRSAEncrypt = (aesKey: string, hashGenerated: string) => {
    return new Promise<any>(async (resolve, reject) => {
        const encryptRsa = new EncryptRsa();
        const rsaEncryptedAESKey = encryptRsa.encryptStringWithRsaPublicKey({ text: aesKey, publicKey } as any);
        const rsaEncryptedHashed = encryptRsa.encryptStringWithRsaPublicKey({ text: hashGenerated, publicKey } as any);

        resolve({ rsaEncryptedAESKey, rsaEncryptedHashed });
    });
};

export const rsaDecrypter = (rsaEncryptedString: string) => {
    const encryptRsa = new EncryptRsa();
    return new Promise<any>((resolve, reject) => {
        try {
            const decrypt = encryptRsa.decryptStringWithRsaPrivateKey({ text: `${rsaEncryptedString}`, privateKey } as any);
            resolve(decrypt);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    })
}

export const aesDecrypter = (aesEncryptedString: string, rsaDryptedAESKey: string) => {
    const iv = "00000000000000000000000000000000";
    return new Promise<any>(async (resolve, reject) => {
        try {
            const decrypt = await CryptoJS.AES.decrypt(
                aesEncryptedString,
                rsaDryptedAESKey,
                { iv: CryptoJS.enc.Hex.parse(iv) }).toString(CryptoJS.enc.Utf8);
            resolve(decrypt);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    })
}

export const sha256HashGen = (toBeHashed: string) => {
    return new Promise<any>(async (resolve, reject) => {
        try {
            const decrypt = CryptoJS.SHA256(toBeHashed).toString(CryptoJS.enc.Hex);
            resolve(decrypt);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    })
}

interface chunkDecryptedType {
    encryptedValue: string;
    rsaEncryptedHashed: string;
    rsaEncryptedAESKey: string;
}

const chunkDecrypter = async ({ encryptedValue, rsaEncryptedHashed, rsaEncryptedAESKey }: chunkDecryptedType) => {
    const rsaDeryptedAESKey = await rsaDecrypter(rsaEncryptedAESKey);
    const rsaDecryptedHashed = await rsaDecrypter(rsaEncryptedHashed);

    const decryptedValue = await aesDecrypter(encryptedValue, rsaDeryptedAESKey);

    const hashedValue = await sha256HashGen(decryptedValue);

    return { rsaDecryptedHashed, hashedValue, decryptedValue }
}

export const payloadDecrypter = async ({ encryptedValue, rsaEncryptedHashed, rsaEncryptedAESKey }: chunkDecryptedType) => {
    const rsaDeryptedAESKey = await rsaDecrypter(rsaEncryptedAESKey);
    const rsaDecryptedHashed = await rsaDecrypter(rsaEncryptedHashed);
    const decryptedValue = await aesDecrypter(encryptedValue, rsaDeryptedAESKey);
    const hashedValue = await sha256HashGen(decryptedValue);
    if (hashedValue == rsaDecryptedHashed) {
        return JSON.parse(decryptedValue)
    }
    return {}
}


export default chunkDecrypter;