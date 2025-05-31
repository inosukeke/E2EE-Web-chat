import { createContext, useState, useEffect, useCallback } from "react";
import { baseUrl, getRequest, postRequest } from "../utils/services";
import { io } from "socket.io-client";

// Tạo AES key (256-bit)
function generateAESKey() {
  return window.crypto.getRandomValues(new Uint8Array(32)); // 32 bytes = 256 bits
}

// Mã hóa nội dung bằng AES (CTR mode hoặc GCM an toàn hơn CBC)
async function encryptMessageAES(message, aesKey) {
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
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// Mã hóa AES key bằng RSA public key người nhận
async function encryptAESKeyWithRSA(aesKey, receiverPublicKeyPem) {
  // B1: Chuyển PEM về ArrayBuffer
  const b64 = receiverPublicKeyPem
    .replace(/-----.*?-----/g, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const publicKey = await window.crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    aesKey
  );

  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function decryptMessageAES(ciphertext, aesKeyBuffer, iv) {
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

//----------------------------Code Grok

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----.*?-----/g, "").replace(/\s/g, "");
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
async function decryptAESKeyWithRSA(encryptedKeyBase64, privateKeyPem) {
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
export const ChatContext = createContext();

export const ChatContextProvider = ({ children, user, privateKey }) => {
  const [userChats, setUserChats] = useState(null);
  const [isUserChatsLoading, setIsUserChatsLoading] = useState(false);
  const [userChatsError, setUserChatsError] = useState(null);
  const [potentialChats, setPotentialChats] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);
  const [sendTextMessageError, setSendTextMessageError] = useState(null);
  const [newMessage, setNewMessage] = useState(null);
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  console.log("notification:", notifications);
  //initial socket
  useEffect(() => {
    const newSocket = io("http://localhost:3000");
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  // add online users
  useEffect(() => {
    if (socket === null) return;
    socket.emit("addNewUser", user?._id);
    socket.on("getOnlineUsers", (res) => {
      setOnlineUsers(res);
    });

    return () => {
      socket.off("getOnlineUsers");
    };
  }, [socket]);

  //send message

  useEffect(() => {
    const sendEncryptedMessageViaSocket = async () => {
      if (socket === null || !newMessage || !user || !currentChat) return;

      const recipientId = currentChat.members?.find((id) => id !== user._id);
      if (!recipientId) return;

      try {
        socket.emit("sendMessage", { ...newMessage, recipientId });
        console.log("sendMessageSocket");
      } catch (err) {
        console.error("Lỗi khi gửi tin nhắn mã hóa qua socket:", err);
      }
    };

    sendEncryptedMessageViaSocket();
  }, [newMessage]);

  // Socket receive message and notification
  useEffect(() => {
    if (socket === null) return;

    socket.on("getMessage", async (res) => {
      if (currentChat?._id !== res.chatId) return;

      if (
        res.ciphertext &&
        (res.encryptedAESKeySender || res.encryptedAESKeyReceiver) &&
        res.iv
      ) {
        try {
          const isSender = res.senderId === user._id;

          const encryptedAESKey = isSender
            ? res.encryptedAESKeySender
            : res.encryptedAESKeyReceiver;

          const aesKey = await decryptAESKeyWithRSA(
            encryptedAESKey,
            privateKey
          );
          const decrypted = await decryptMessageAES(
            res.ciphertext,
            aesKey,
            res.iv
          );

          setMessages((prev) => [
            ...prev,
            {
              ...res,
              text: decrypted,
              ciphertext: undefined,
              encryptedAESKeyReceiver: undefined,
              encryptedAESKeySender: undefined,
              iv: undefined,
            },
          ]);
        } catch (err) {
          console.error("Lỗi giải mã socket message:", err);
          setMessages((prev) => [
            ...prev,
            {
              ...res,
              text: "[Không thể giải mã tin nhắn]",
            },
          ]);
        }
      } else {
        setMessages((prev) => [...prev, res]);
      }
    });
    socket.on("getNotification", (res) => {
      const isChatOpen = currentChat?.members.some((id) => id === res.senderId);
      if (isChatOpen) {
        setNotifications((prev) => [{ ...res, isRead: true }, ...prev]);
      } else {
        setNotifications((prev) => [res, ...prev]);
      }
    });
    return () => {
      socket.off("getMessage");
      socket.off("getNotification");
    };
  }, [socket, currentChat, privateKey, user]);

  const sendTextMessage = useCallback(
    async (textMessage, sender, currentChatId, setTextMessage) => {
      if (!textMessage) return console.log("You must type something");

      try {
        // 1. Sinh AES key (random 256-bit)
        const aesKey = generateAESKey();

        // 2. Mã hóa nội dung bằng AES
        const { ciphertext, iv } = await encryptMessageAES(textMessage, aesKey);

        // 3. Xác định người nhận (chỉ dùng cho chat 1-1)
        const receiverId = currentChat?.members?.find(
          (id) => id !== sender._id
        );

        if (!receiverId) {
          return setSendTextMessageError("Không tìm thấy người nhận.");
        }

        // 4. Lấy public key của người nhận từ backend
        const publicKeyRes = await getRequest(
          `${baseUrl}/users/publicKey/${receiverId}`
        );

        if (publicKeyRes.error || !publicKeyRes.publicKey) {
          return setSendTextMessageError(
            "Không lấy được public key người nhận."
          );
        }

        // 5. Mã hóa AES key bằng public key người nhận và người gửi (Hybrid E2EE)
        const encryptedAESKeyReceiver = await encryptAESKeyWithRSA(
          aesKey,
          publicKeyRes.publicKey
        );

        const encryptedAESKeySender = await encryptAESKeyWithRSA(
          aesKey,
          sender.publicKey
        );

        // 6. Gửi tin nhắn đã mã hóa
        const messageData = {
          chatId: currentChatId,
          senderId: sender._id,
          ciphertext,
          encryptedAESKeyReceiver,
          encryptedAESKeySender,
          iv,
        };

        const res = await postRequest(`${baseUrl}/messages`, messageData);

        if (res.error) {
          return setSendTextMessageError(res);
        }
        console.log("messageData:", messageData);
        // 7. Cập nhật UI
        setNewMessage(res);
        console.log("newmessage", newMessage);
        setMessages((prev) => [
          ...prev,
          {
            ...res,
            text: textMessage,
            ciphertext: undefined,
            encryptedAESKeyReceiver: undefined,
            encryptedAESKeySender: undefined,
            iv: undefined,
          },
        ]);

        setTextMessage("");
      } catch (err) {
        console.error("Lỗi mã hóa tin nhắn:", err);
        setSendTextMessageError("Gửi tin nhắn thất bại.");
      }
    },
    [currentChat, setMessages, setNewMessage]
  );

  // useEffect để load lịch sử tin nhắn khi currentChat đổi

  useEffect(() => {
    const getMessages = async () => {
      if (!currentChat?._id || !privateKey) return;
      setIsMessagesLoading(true);
      setMessagesError(null);

      try {
        const response = await getRequest(
          `${baseUrl}/messages/${currentChat._id}`
        );
        console.log("getmessage");
        if (response.error) {
          return setMessagesError(response);
        }

        // Giải mã tất cả tin nhắn
        const decryptedMessages = await Promise.all(
          response.map(async (msg) => {
            if (
              msg.ciphertext &&
              (msg.encryptedAESKeySender || msg.encryptedAESKeyReceiver) &&
              msg.iv
            ) {
              try {
                const isSender = msg.senderId === user._id;

                const encryptedAESKey = isSender
                  ? msg.encryptedAESKeySender
                  : msg.encryptedAESKeyReceiver;
                // Log inputs for debugging
                console.log("Decrypting message:", {
                  messageId: msg._id,
                  isSender,
                  encryptedAESKey,
                  ciphertext: msg.ciphertext,
                  iv: msg.iv,
                  privateKey: privateKey.substring(0, 50) + "...", // Truncate for safety
                });

                const aesKey = await decryptAESKeyWithRSA(
                  encryptedAESKey,
                  privateKey
                );
                console.log("Decrypted AES key:", aesKey);
                const decryptedText = await decryptMessageAES(
                  msg.ciphertext,
                  aesKey,
                  msg.iv
                );
                console.log("Decrypted text:", decryptedText);
                return {
                  ...msg,
                  text: decryptedText,
                  ciphertext: undefined,
                  encryptedAESKeyReceiver: undefined,
                  encryptedAESKeySender: undefined,
                  iv: undefined,
                };
              } catch (err) {
                console.error("Lỗi giải mã tin nhắn:", err);
                return { ...msg, text: "[Không thể giải mã tin nhắn]" };
              }
            }

            return msg;
          })
        );

        setMessages(decryptedMessages);
        setIsMessagesLoading(false);
      } catch (err) {
        console.error("Lỗi lấy tin nhắn:", err);

        setMessagesError({ message: "Không thể lấy tin nhắn." });
      }
    };

    getMessages();
  }, [currentChat, privateKey, user]);

  // Lấy danh sách người dùng chưa trò chuyện
  useEffect(() => {
    const getUsers = async () => {
      const response = await getRequest(`${baseUrl}/users`);

      if (response.error) {
        return console.log("Error fetching users", response);
      }
      const pChats = response.filter((u) => {
        let isChatCreated = false;

        if (user?._id === u._id) return false;

        if (userChats) {
          isChatCreated = userChats?.some((chat) => {
            return chat.members[0] === u._id || chat.members[1] === u._id;
          });
        }

        return !isChatCreated;
      });
      setPotentialChats(pChats);
      setAllUsers(response);
    };
    getUsers();
  }, [userChats]);

  useEffect(() => {
    const getUserChats = async () => {
      if (user?._id) {
        setIsUserChatsLoading(true);
        setUserChatsError(null);

        const response = await getRequest(`${baseUrl}/chats/${user?._id}`);
        setIsUserChatsLoading(false);

        if (response.error) {
          return setUserChatsError(response);
        }

        setUserChats(response);
      }
    };
    getUserChats();
  }, [user]);
  const updateCurrentchat = useCallback((chat) => {
    setCurrentChat(chat);
  }, []);

  const createChat = useCallback(async (firstId, secondId) => {
    const response = await postRequest(`${baseUrl}/chats`, {
      firstId,
      secondId,
    });
    if (response.error) {
      return console.log("Error creating chat", response);
    }
    setUserChats((prev) => [...prev, response]);
    return response;
  }, []);

  const markAllNotificationsAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, isRead: true }))
    );
  }, []);

  const markNotificationAsRead = useCallback(
    (n, userChats, user, notifications) => {
      //find chat to open

      const desiredChat = userChats.find((chat) => {
        const chatMembers = [user._id, n.senderId];
        const isDesiredChat = chat.members.every((member) =>
          chatMembers.includes(member)
        );
        return isDesiredChat;
      });

      //mark notification as read
      const mNotification = notifications.map((el) => {
        if (n.senderId === el.senderId) {
          return { ...n, isRead: true };
        } else {
          return el;
        }
      });

      updateCurrentchat(desiredChat);
      setNotifications(mNotification);
    },
    []
  );

  const markThisUserNotificationAsRead = useCallback(
    (thisUserNotifications, notifications) => {
      const mNotification = notifications.map((el) => {
        let notification;
        thisUserNotifications.forEach((n) => {
          if (n.senderId === el.senderId) {
            notification = { ...n, isRead: true };
          } else {
            notification = el;
          }
        });
        return notification;
      });
      setNotifications(mNotification);
    },
    []
  );
  return (
    <ChatContext.Provider
      value={{
        userChats,
        isUserChatsLoading,
        userChatsError,
        potentialChats,
        createChat,
        updateCurrentchat,
        currentChat,
        messages,
        isMessagesLoading,
        messagesError,
        sendTextMessage,
        onlineUsers,
        notifications,
        allUsers,
        markAllNotificationsAsRead,
        markNotificationAsRead,
        markThisUserNotificationAsRead,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
