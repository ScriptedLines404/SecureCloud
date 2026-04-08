/**
 * SecureCloud - Zero-Knowledge Encrypted Flie Encryptor for Cloud Storage
 * Copyright (C) 2026 Vladimir Illich Arunan V V
 * 
 * This file is part of SecureCloud.
 * 
 * SecureCloud is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * SecureCloud is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with SecureCloud. If not, see <https://www.gnu.org/licenses/>.
 */

export const encodeBase64 = (data) => {
    if (data instanceof Uint8Array) {
        let binary = '';
        const bytes = new Uint8Array(data);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    } else if (typeof data === 'string') {
        return btoa(data);
    } else if (data.buffer instanceof ArrayBuffer) {
        const bytes = new Uint8Array(data);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    throw new Error('Unsupported data type for base64 encoding');
};

export const decodeBase64 = (str) => {
    str = str.replace(/\s/g, '');
    
    while (str.length % 4) {
        str += '=';
    }
    
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

export const stringToUint8Array = (str) => {
    return new TextEncoder().encode(str);
};

export const uint8ArrayToString = (array) => {
    return new TextDecoder().decode(array);
};