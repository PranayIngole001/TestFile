import { compare, hash } from 'bcryptjs';

const saltRounds = 12;

export async function hashPassword(plaintextPassword: string) {
    return await hash(plaintextPassword, saltRounds);
}

export async function checkHashPassword(plaintextPassword: string, hashedPassword: string) {
    return await compare(plaintextPassword, hashedPassword);
}