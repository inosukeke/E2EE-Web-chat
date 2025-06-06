import {
  pemToArrayBuffer,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./cryptoUtils";

// Tạo AES key (256-bit)
export async function generateAESKey() {
  try {
    return await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true, // extractable
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    console.error("Error in generateAESKey:", error);
    throw error;
  }
}

// Mã hóa nội dung bằng AES (GCM mode)
export async function encryptMessageAES(message, aesKey) {
  try {
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
  } catch (error) {
    console.error("Error in encryptMessageAES:", error);
    throw error;
  }
}

// Mã hóa AES key bằng RSA public key người nhận
export async function encryptAESKeyWithRSA(aesKey, receiverPublicKeyPem) {
  try {
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
  } catch (error) {
    console.error("Error in encryptAESKeyWithRSA:", error);
    throw error;
  }
}

export async function decryptMessageAES(ciphertext, aesKey, iv) {
  try {
    // If aesKey is an ArrayBuffer, import it first
    let key = aesKey;
    if (aesKey instanceof ArrayBuffer) {
      key = await window.crypto.subtle.importKey(
        "raw",
        aesKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
    }

    // Convert base64 strings to ArrayBuffer
    const ivBuffer = base64ToArrayBuffer(iv);
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);

    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(ivBuffer),
      },
      key,
      ciphertextBuffer
    );

    return { message: new TextDecoder().decode(decryptedContent) };
  } catch (error) {
    console.error("Error in decryptMessageAES:", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

export async function decryptAESKeyWithRSA(encryptedKeyBase64, privateKeyPem) {
  try {
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
    return await window.crypto.subtle.importKey(
      "raw",
      decryptedKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    console.error("Error in decryptAESKeyWithRSA:", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
