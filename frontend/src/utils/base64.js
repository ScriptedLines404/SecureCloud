// frontend/src/utils/base64.js
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