import { createContext, useCallback, useEffect, useState } from "react";
import { baseUrl, postRequest } from "../utils/services";

function convertToPem(buffer, label) {
  const base64 = window.btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const formatted = base64.match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${formatted}\n-----END ${label}-----`;
}

export const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [registerError, setRegisterError] = useState(null);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [privateKey, setPrivateKey] = useState(null);

  const [registerInfo, setRegisterInfo] = useState({
    name: "",
    email: "",
    password: "",
    publicKey: "",
  });

  const [loginError, setLoginError] = useState(null);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [loginInfo, setLoginInfo] = useState({
    email: "",
    password: "",
  });

  //load user from local storage
  useEffect(() => {
    const user = localStorage.getItem("User");

    setUser(JSON.parse(user));
  }, []);

  const updateRegisterInfo = useCallback((info) => {
    setRegisterInfo(info);
  }, []);

  const updateLoginInfo = useCallback((info) => {
    setLoginInfo(info);
  }, []);

  const registerUser = useCallback(
    async (e) => {
      e.preventDefault();
      setIsRegisterLoading(true);
      setRegisterError(null);

      try {
        console.log("[Register] Starting registration process...");

        // 1. Tạo cặp khóa RSA
        console.log("[Register] Generating RSA key pair (2048 bits)...");
        const keyPair = await window.crypto.subtle.generateKey(
          {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
          },
          true,
          ["encrypt", "decrypt"]
        );
        console.log("[Register] RSA key pair generated successfully");

        // 2. Export khóa công khai và riêng tư
        console.log("[Register] Exporting keys to PEM format...");
        const publicKeyBuffer = await window.crypto.subtle.exportKey(
          "spki",
          keyPair.publicKey
        );
        const privateKeyBuffer = await window.crypto.subtle.exportKey(
          "pkcs8",
          keyPair.privateKey
        );

        const publicKeyPem = convertToPem(publicKeyBuffer, "PUBLIC KEY");
        const privateKeyPem = convertToPem(privateKeyBuffer, "PRIVATE KEY");
        console.log("[Register] Keys exported successfully:", {
          publicKeyLength: publicKeyPem.length,
          privateKeyLength: privateKeyPem.length,
        });

        // 3. Tạo salt và iv ngẫu nhiên
        console.log("[Register] Generating cryptographic parameters...");
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        console.log("[Register] Generated parameters:", {
          saltLength: salt.length,
          ivLength: iv.length,
        });

        // 4. Derive AES key từ mật khẩu + salt
        console.log("[Register] Deriving encryption key from password...");
        const passwordBuffer = new TextEncoder().encode(registerInfo.password);
        const keyMaterial = await window.crypto.subtle.importKey(
          "raw",
          passwordBuffer,
          "PBKDF2",
          false,
          ["deriveKey"]
        );
        const aesKey = await window.crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256",
          },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt"]
        );
        console.log("[Register] Key derivation completed");

        // 5. Mã hóa private key với AES-GCM
        console.log("[Register] Encrypting private key...");
        const privateKeyData = new TextEncoder().encode(privateKeyPem);
        const encryptedPrivateKeyBuffer = await window.crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: iv,
          },
          aesKey,
          privateKeyData
        );
        console.log("[Register] Private key encrypted:", {
          originalLength: privateKeyData.length,
          encryptedLength: encryptedPrivateKeyBuffer.byteLength,
        });

        // 6. Gửi thông tin đăng ký
        console.log("[Register] Sending registration data to server...");
        const newUser = {
          name: registerInfo.name,
          email: registerInfo.email,
          password: registerInfo.password,
          publicKey: publicKeyPem,
        };

        const response = await postRequest(
          `${baseUrl}/users/register`,
          newUser
        );

        setIsRegisterLoading(false);
        if (response.error) {
          console.error("[Register] Registration failed:", response.error);
          return setRegisterError(response);
        }
        console.log("[Register] Server registration successful");

        // 7. Lưu encrypted private key
        console.log("[Register] Preparing to store encrypted private key...");
        const encryptedPrivateKeyBase64 = window.btoa(
          String.fromCharCode(...new Uint8Array(encryptedPrivateKeyBuffer))
        );
        const saltBase64 = window.btoa(String.fromCharCode(...salt));
        const ivBase64 = window.btoa(String.fromCharCode(...iv));

        const encryptedData = {
          encryptedPrivateKey: encryptedPrivateKeyBase64,
          salt: saltBase64,
          iv: ivBase64,
        };

        try {
          localStorage.setItem(
            "EncryptedPrivateKey_" + newUser.email,
            JSON.stringify(encryptedData)
          );
          console.log("[Register] Encrypted private key stored successfully");
        } catch (e) {
          console.error("[Register] Failed to store encrypted private key:", e);
        }

        // 8. Hoàn tất đăng ký
        console.log("[Register] Registration completed successfully");
        setUser(response);
        setPrivateKey(privateKeyPem);
        localStorage.setItem("User", JSON.stringify(response));
      } catch (error) {
        console.error("[Register] Critical error during registration:", {
          error: error.message,
          stack: error.stack,
        });
        setRegisterError({ message: "Đăng ký thất bại: " + error.message });
        setIsRegisterLoading(false);
      }
    },
    [registerInfo]
  );

  const loginUser = useCallback(
    async (e) => {
      e.preventDefault();
      setIsLoginLoading(true);
      setLoginError(null);

      try {
        console.log("[Login] Starting login process...");

        // 1. Xác thực với server
        console.log("[Login] Authenticating with server...");
        const response = await postRequest(`${baseUrl}/users/login`, loginInfo);

        setIsLoginLoading(false);

        if (response.error) {
          console.error(
            "[Login] Server authentication failed:",
            response.error
          );
          return setLoginError(response);
        }
        console.log("[Login] Server authentication successful");

        // 2. Lưu thông tin user
        localStorage.setItem("User", JSON.stringify(response));
        setUser(response);

        // 3. Lấy encrypted private key
        console.log("[Login] Retrieving encrypted private key...");
        const encryptedDataStr = localStorage.getItem(
          `EncryptedPrivateKey_${response.email}`
        );

        if (!encryptedDataStr) {
          console.error(
            "[Login] Encrypted private key not found for user:",
            response.email
          );
          throw new Error("Không tìm thấy khóa riêng tư đã mã hóa");
        }

        const { encryptedPrivateKey, salt, iv } = JSON.parse(encryptedDataStr);
        console.log("[Login] Retrieved encrypted data:", {
          hasEncryptedKey: !!encryptedPrivateKey,
          hasSalt: !!salt,
          hasIV: !!iv,
        });

        // 4. Chuẩn bị giải mã
        console.log("[Login] Preparing decryption parameters...");
        const saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
        const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

        // 5. Tạo key từ password
        console.log("[Login] Deriving key from password...");
        const passwordKey = await window.crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(loginInfo.password),
          { name: "PBKDF2" },
          false,
          ["deriveKey"]
        );

        const aesKey = await window.crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: saltBuffer,
            iterations: 100000,
            hash: "SHA-256",
          },
          passwordKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
        console.log("[Login] Key derivation completed");

        // 6. Giải mã private key
        console.log("[Login] Decrypting private key...");
        const encryptedBytes = Uint8Array.from(atob(encryptedPrivateKey), (c) =>
          c.charCodeAt(0)
        );

        const decryptedBuffer = await window.crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: ivBuffer,
          },
          aesKey,
          encryptedBytes
        );

        const decryptedPrivateKey = new TextDecoder().decode(decryptedBuffer);
        console.log("[Login] Private key decrypted successfully:", {
          keyLength: decryptedPrivateKey.length,
          isValidPEM: decryptedPrivateKey.includes("BEGIN PRIVATE KEY"),
        });

        if (!decryptedPrivateKey) {
          throw new Error("Không giải mã được khóa riêng tư");
        }

        // 7. Hoàn tất đăng nhập
        setPrivateKey(decryptedPrivateKey);
        console.log("[Login] Login completed successfully");
      } catch (error) {
        console.error("[Login] Critical error during login:", {
          error: error.message,
          stack: error.stack,
        });
        setLoginError({ message: "Đăng nhập thất bại: " + error.message });
        setIsLoginLoading(false);
        alert("Sai mật khẩu hoặc lỗi giải mã private key.");
      }
    },
    [loginInfo]
  );

  const logoutUser = useCallback(() => {
    try {
      // Xóa thông tin người dùng trong localStorage
      localStorage.removeItem("User");

      // Xóa state và context liên quan
      setPrivateKey(null);
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        registerInfo,
        updateRegisterInfo,
        registerUser,
        registerError,
        isRegisterLoading,
        logoutUser,
        loginUser,
        loginError,
        loginInfo,
        updateLoginInfo,
        isLoginLoading,
        privateKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// export default AuthContextProvider;
