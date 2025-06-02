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
        // 1. Tạo cặp khóa RSA
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

        // 2. Export khóa công khai và riêng tư dưới dạng PEM
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

        // 3. Tạo salt và iv ngẫu nhiên
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        // 4. Derive AES key từ mật khẩu + salt
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

        // 5. Mã hóa private key (dạng chuỗi PEM) với AES-GCM
        const privateKeyData = new TextEncoder().encode(privateKeyPem);
        const encryptedPrivateKeyBuffer = await window.crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: iv,
          },
          aesKey,
          privateKeyData
        );

        // 6. Gửi publicKey + info lên server
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
          return setRegisterError(response);
        }

        // 7. Chuyển đổi encryptedPrivateKeyBuffer, salt, iv sang base64
        const encryptedPrivateKeyBase64 = window.btoa(
          String.fromCharCode(...new Uint8Array(encryptedPrivateKeyBuffer))
        );
        const saltBase64 = window.btoa(String.fromCharCode(...salt));
        const ivBase64 = window.btoa(String.fromCharCode(...iv));

        // Lưu vào localStorage
        const encryptedData = {
          encryptedPrivateKey: encryptedPrivateKeyBase64,
          salt: saltBase64,
          iv: ivBase64,
        };
        console.log("encryptedData", encryptedData);
        try {
          localStorage.setItem(
            "EncryptedPrivateKey_" + newUser.email,
            JSON.stringify(encryptedData)
          );
        } catch (e) {
          console.error("Failed to store in localStorage:", e);
        }

        // 8. Đăng nhập
        setUser(response);
        setPrivateKey(privateKeyPem);
        console.log("privateKeyPem", privateKeyPem);
        localStorage.setItem("User", JSON.stringify(response));
      } catch (error) {
        console.error("Lỗi đăng ký:", error);
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
        // Gửi yêu cầu đăng nhập lên server
        const response = await postRequest(`${baseUrl}/users/login`, loginInfo);

        setIsLoginLoading(false);

        if (response.error) {
          return setLoginError(response);
        }

        // Lưu thông tin người dùng
        localStorage.setItem("User", JSON.stringify(response));
        setUser(response);

        // Lấy encryptedPrivateKey và salt
        const encryptedDataStr = localStorage.getItem(
          `EncryptedPrivateKey_${response.email}`
        );

        if (!encryptedDataStr) {
          console.warn("Không tìm thấy EncryptedPrivateKey!");
          return;
        }

        const { encryptedPrivateKey, salt, iv } = JSON.parse(encryptedDataStr);

        // 1. Convert salt & iv về ArrayBuffer
        const saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
        const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

        // 2. Tạo key từ mật khẩu + salt
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

        // 3. Giải mã privateKey
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

        if (!decryptedPrivateKey) {
          throw new Error("Không giải mã được khóa riêng");
        }

        // Lưu vào RAM
        setPrivateKey(decryptedPrivateKey);
        console.log("decryptedPrivateKey:", decryptedPrivateKey);
      } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        setLoginError({ message: "Đăng nhập thất bại" });
        setIsLoginLoading(false);
        alert("Sai mật khẩu hoặc lỗi giải mã private key.");
      }
    },
    [loginInfo]
  );

  const logoutUser = useCallback(() => {
    // Lưu email trước khi xóa user
    const userEmail = user?.email;

    // Xóa thông tin người dùng và private key trong localStorage
    localStorage.removeItem("User");

    // Chỉ xóa EncryptedPrivateKey nếu có email
    if (userEmail) {
      localStorage.removeItem(`EncryptedPrivateKey_${userEmail}`);
    }

    // Xóa state và context liên quan
    setPrivateKey(null);
    setUser(null);
  }, [user]);

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
