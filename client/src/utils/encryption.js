import {
  pemToArrayBuffer,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./cryptoUtils";

// Tạo AES key (256-bit)
export function generateAESKey() {
  return window.crypto.getRandomValues(new Uint8Array(32)); // 32 bytes = 256 bits
}

// Mã hóa nội dung bằng AES (GCM an toàn hơn CBC)
export async function encryptMessageAES(message, aesKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // IV 96-bit
  const encoded = new TextEncoder().encode(message);
  const key = await window.crypto.subtle.importKey(
    "raw",
    aesKey,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
  };
}

// Mã hóa AES key bằng RSA public key người nhận
export async function encryptAESKeyWithRSA(aesKey, receiverPublicKeyPem) {
  const publicKey = await window.crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(receiverPublicKeyPem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    aesKey
  );

  return arrayBufferToBase64(encrypted);
}

export async function decryptMessageAES(ciphertext, aesKeyBuffer, iv) {
  const key = await window.crypto.subtle.importKey(
    "raw",
    aesKeyBuffer,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const decryptedContent = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(iv)),
    },
    key,
    new Uint8Array(base64ToArrayBuffer(ciphertext))
  );

  return { message: new TextDecoder().decode(decryptedContent) };
}

export async function decryptAESKeyWithRSA(encryptedKeyBase64, privateKeyPem) {
  const encryptedKey = base64ToArrayBuffer(encryptedKeyBase64);
  const privateKey = await window.crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"]
  );
  const decryptedKey = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    encryptedKey
  );
  return new Uint8Array(decryptedKey);
}
