import { createContext, useCallback, useEffect, useState } from "react";
import { baseUrl, postRequest } from "../utils/services";
import { convertToPem } from "../utils/cryptoUtils";

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
        console.log("[Register] ===== BẮT ĐẦU QUÁ TRÌNH ĐĂNG KÝ =====");

        // 1. Tạo cặp khóa RSA
        console.log("[Register] Đang tạo cặp khóa RSA...");
        console.log("[Register] Thông số RSA:", {
          algorithm: "RSA-OAEP",
          modulusLength: "2048 bits",
          publicExponent: "65537 (0x010001)",
          hashAlgorithm: "SHA-256",
        });

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
        console.log("[Register] Đã tạo thành công cặp khóa RSA");

        // 2. Export khóa công khai và riêng tư
        console.log("[Register] Đang chuyển đổi khóa sang định dạng PEM...");
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

        console.log("[Register] Thông tin khóa:", {
          publicKeyFormat: "SPKI (SubjectPublicKeyInfo)",
          privateKeyFormat: "PKCS#8",
          publicKeyLength: publicKeyPem.length + " bytes",
          privateKeyLength: privateKeyPem.length + " bytes",
          publicKeyPreview: publicKeyPem.substring(0, 64) + "...",
        });

        // 3. Tạo salt và iv
        console.log("[Register] Đang tạo salt và IV...");
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        console.log("[Register] Thông số bảo mật:", {
          saltLength: salt.length * 8 + " bits",
          ivLength: iv.length * 8 + " bits",
          saltHex: Array.from(salt)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
          ivHex: Array.from(iv)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        });

        // 4. Derive AES key
        console.log("[Register] Đang tạo khóa AES từ mật khẩu...");
        console.log("[Register] Thông số PBKDF2:", {
          iterations: "100,000",
          hashFunction: "SHA-256",
          derivedKeyLength: "256 bits",
          saltLength: "128 bits",
        });

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
        console.log("[Register] Đã tạo thành công khóa AES");

        // 5. Mã hóa private key
        console.log("[Register] Đang mã hóa private key...");
        const privateKeyData = new TextEncoder().encode(privateKeyPem);
        const encryptedPrivateKeyBuffer = await window.crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: iv,
          },
          aesKey,
          privateKeyData
        );
        console.log("[Register] Kết quả mã hóa private key:", {
          originalSize: privateKeyData.length + " bytes",
          encryptedSize: encryptedPrivateKeyBuffer.byteLength + " bytes",
          algorithm: "AES-GCM 256-bit",
        });

        // 6. Gửi thông tin đăng ký
        console.log("[Register] Đang gửi thông tin đăng ký lên server...");
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
          console.error("[Register] Đăng ký thất bại:", response.error);
          return setRegisterError(response);
        }
        console.log("[Register] Đăng ký thành công trên server");

        // 7. Lưu encrypted private key
        console.log("[Register] Đang lưu khóa riêng tư đã mã hóa...");
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
          console.log("[Register] Đã lưu khóa riêng tư đã mã hóa");
        } catch (e) {
          console.error("[Register] Lỗi khi lưu khóa riêng tư:", e);
        }

        // 8. Hoàn tất đăng ký
        console.log("[Register] ===== HOÀN TẤT ĐĂNG KÝ =====");
        setUser(response);
        setPrivateKey(privateKeyPem);
        localStorage.setItem("User", JSON.stringify(response));
      } catch (error) {
        console.error("[Register] Lỗi trong quá trình đăng ký:", {
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
        console.log("[Login] ===== BẮT ĐẦU QUÁ TRÌNH ĐĂNG NHẬP =====");

        console.log("[Login] Đang xác thực với server...");
        const response = await postRequest(`${baseUrl}/users/login`, loginInfo);

        setIsLoginLoading(false);

        if (response.error) {
          console.error("[Login] Xác thực thất bại:", response.error);
          return setLoginError(response);
        }
        console.log("[Login] Xác thực thành công");

        localStorage.setItem("User", JSON.stringify(response));
        setUser(response);

        console.log("[Login] Đang lấy khóa riêng tư đã mã hóa...");
        const encryptedDataStr = localStorage.getItem(
          `EncryptedPrivateKey_${response.email}`
        );

        if (!encryptedDataStr) {
          throw new Error("Không tìm thấy khóa riêng tư đã mã hóa");
        }

        const { encryptedPrivateKey, salt, iv } = JSON.parse(encryptedDataStr);
        console.log("[Login] Thông tin mã hóa:", {
          encryptedKeyLength: encryptedPrivateKey.length + " bytes",
          saltLength: salt.length + " bytes",
          ivLength: iv.length + " bytes",
        });

        console.log("[Login] Đang chuẩn bị giải mã...");
        const saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
        const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

        console.log("[Login] Đang tạo lại khóa AES từ mật khẩu...");
        console.log("[Login] Thông số PBKDF2:", {
          iterations: "100,000",
          hashFunction: "SHA-256",
          derivedKeyLength: "256 bits",
          saltHex: Array.from(saltBuffer)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        });

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
        console.log("[Login] Đã tạo lại thành công khóa AES");

        console.log("[Login] Đang giải mã private key...");
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
        console.log("[Login] Kết quả giải mã:", {
          encryptedSize: encryptedBytes.length + " bytes",
          decryptedSize: decryptedBuffer.byteLength + " bytes",
          isValidPEM: decryptedPrivateKey.includes("BEGIN PRIVATE KEY"),
          keyPreview: decryptedPrivateKey.substring(0, 64) + "...",
        });

        setPrivateKey(decryptedPrivateKey);
        console.log("[Login] ===== HOÀN TẤT ĐĂNG NHẬP =====");
      } catch (error) {
        console.error("[Login] Lỗi nghiêm trọng:", {
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
      localStorage.removeItem("User");
      setPrivateKey(null);
      setUser(null);
    } catch (error) {
      console.error("[Logout] Lỗi:", error);
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
