// Hàm chuyển đổi base64 sang ArrayBuffer
export function base64ToArrayBuffer(base64) {
  try {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("Error in base64ToArrayBuffer:", error);
    throw error;
  }
}

// Hàm chuyển đổi PEM sang ArrayBuffer
export function pemToArrayBuffer(pem) {
  try {
    // Loại bỏ header và footer PEM
    const b64 = pem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "");

    // Chuyển base64 thành ArrayBuffer
    return base64ToArrayBuffer(b64);
  } catch (error) {
    console.error("Error in pemToArrayBuffer:", error);
    throw error;
  }
}

// Hàm chuyển đổi ArrayBuffer sang base64
export function arrayBufferToBase64(buffer) {
  try {
    return window.btoa(String.fromCharCode(...new Uint8Array(buffer)));
  } catch (error) {
    console.error("Error in arrayBufferToBase64:", error);
    throw error;
  }
}

export function convertToPem(buffer, label) {
  try {
    const base64 = window.btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const formatted = base64.match(/.{1,64}/g).join("\n");
    return `-----BEGIN ${label}-----\n${formatted}\n-----END ${label}-----`;
  } catch (error) {
    console.error("Error in convertToPem:", error);
    throw error;
  }
}
