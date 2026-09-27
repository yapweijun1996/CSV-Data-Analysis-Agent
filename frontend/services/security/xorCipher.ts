/**
 * XOR cipher — reversible byte-level obfuscation, NOT real encryption.
 *
 * Anyone who reads this source (or the shipped browser bundle, since
 * decoding must also happen client-side) can trivially recover the
 * plaintext: XOR with a fixed key has no cryptographic security
 * properties. Use this only for values that are meant to be publicly
 * usable and are protected by a server-side control (e.g. rate limiting)
 * rather than by secrecy — see config/defaultGatewayConfig.ts.
 */

const toHex = (bytes: number[]): string =>
    bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): number[] => {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
    }
    return bytes;
};

export const xorEncodeToHex = (plainText: string, key: string): string => {
    const bytes = Array.from(plainText).map((char, index) =>
        char.charCodeAt(0) ^ key.charCodeAt(index % key.length),
    );
    return toHex(bytes);
};

export const xorDecodeFromHex = (hexCipherText: string, key: string): string =>
    fromHex(hexCipherText)
        .map((byte, index) => String.fromCharCode(byte ^ key.charCodeAt(index % key.length)))
        .join('');
