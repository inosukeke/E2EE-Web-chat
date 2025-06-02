import { pemToArrayBuffer, arrayBufferToBase64 } from "./cryptoUtils";

// Hàm tạo chữ ký số từ message và private key
export const signMessage = async (message, privateKeyPem) => {
  try {
    if (!privateKeyPem) {
      throw new Error("Private key is missing");
    }

    // Chuyển đổi private key PEM sang CryptoKey
    const privateKey = await window.crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKeyPem),
      {
        name: "RSA-PSS",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    // Tạo message digest
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    // Tạo chữ ký
    const signature = await window.crypto.subtle.sign(
      {
        name: "RSA-PSS",
        saltLength: 32,
      },
      privateKey,
      data
    );

    // Chuyển signature sang base64
    return arrayBufferToBase64(signature);
  } catch (error) {
    console.error("Error signing message:", error);
    throw error;
  }
};

// Hàm xác thực chữ ký số
export const verifySignature = async (message, signature, publicKeyPem) => {
  try {
    if (!message || !signature || !publicKeyPem) {
      console.error("Missing required parameters:", {
        hasMessage: !!message,
        hasSignature: !!signature,
        hasPublicKey: !!publicKeyPem,
      });
      return false;
    }

    // Chuyển đổi public key PEM sang CryptoKey
    const publicKey = await window.crypto.subtle.importKey(
      "spki",
      pemToArrayBuffer(publicKeyPem),
      {
        name: "RSA-PSS",
        hash: "SHA-256",
      },
      false,
      ["verify"]
    );

    // Chuyển đổi message thành ArrayBuffer
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    // Chuyển đổi signature từ base64 sang ArrayBuffer
    const signatureBuffer = new Uint8Array(pemToArrayBuffer(signature));

    // Xác thực chữ ký
    const isValid = await window.crypto.subtle.verify(
      {
        name: "RSA-PSS",
        saltLength: 32,
      },
      publicKey,
      signatureBuffer,
      data
    );

    return isValid;
  } catch (error) {
    console.error("Error verifying signature:", error, {
      messageLength: message?.length,
      signatureLength: signature?.length,
      publicKeyLength: publicKeyPem?.length,
    });
    return false;
  }
};
