import {
  pemToArrayBuffer,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./cryptoUtils";

// Tạo AES key (256-bit)
export async function generateAESKey() {
  return window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

// Mã hóa nội dung bằng AES (GCM mode)
export async function encryptMessageAES(message, aesKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // IV 96-bit
  const encoded = new TextEncoder().encode(message);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  // Export the AES key for storage/transmission
  const exportedKey = await window.crypto.subtle.exportKey("raw", aesKey);

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    exportedKey: arrayBufferToBase64(exportedKey),
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

  // Export the AES key before RSA encryption
  const exportedKey = await window.crypto.subtle.exportKey("raw", aesKey);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    exportedKey
  );

  return arrayBufferToBase64(encrypted);
}

export async function decryptMessageAES(ciphertext, aesKeyBuffer, iv) {
  // Import the AES key from raw bytes
  const key = await window.crypto.subtle.importKey(
    "raw",
    aesKeyBuffer,
    { name: "AES-GCM", length: 256 },
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

  // Import the decrypted AES key
  return window.crypto.subtle.importKey(
    "raw",
    decryptedKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
