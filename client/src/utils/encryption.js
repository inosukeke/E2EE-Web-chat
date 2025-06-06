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
    // Ensure we have a valid key
    if (!(aesKey instanceof CryptoKey)) {
      throw new Error("Invalid AES key format");
    }

    // Generate a random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // IV 96-bit

    // Encode the message
    const encoder = new TextEncoder();
    const encoded = encoder.encode(message);

    // Encrypt the message
    const ciphertext = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128,
      },
      aesKey,
      encoded
    );

    // Convert results to base64
    return {
      ciphertext: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv),
    };
  } catch (error) {
    console.error("Error in encryptMessageAES:", {
      error: error.message,
      stack: error.stack,
      keyType: aesKey instanceof CryptoKey ? "CryptoKey" : typeof aesKey,
      messageType: typeof message,
    });
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
    // Ensure we have all required parameters
    if (!ciphertext || !aesKey || !iv) {
      throw new Error("Missing required parameters for decryption");
    }

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

    // Ensure we have a valid CryptoKey
    if (!(key instanceof CryptoKey)) {
      throw new Error("Invalid AES key format");
    }

    // Convert base64 strings to ArrayBuffer
    const ivBuffer = base64ToArrayBuffer(iv);
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);

    // Decrypt the content
    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(ivBuffer),
        tagLength: 128,
      },
      key,
      ciphertextBuffer
    );

    // Decode the decrypted content
    const decoder = new TextDecoder();
    const message = decoder.decode(decryptedContent);

    return { message };
  } catch (error) {
    console.error("Error in decryptMessageAES:", {
      error: error.message,
      stack: error.stack,
      hasCiphertext: !!ciphertext,
      hasKey: !!aesKey,
      hasIV: !!iv,
      keyType: aesKey instanceof CryptoKey ? "CryptoKey" : typeof aesKey,
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
