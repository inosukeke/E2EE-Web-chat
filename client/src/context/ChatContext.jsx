import { createContext, useState, useEffect, useCallback } from "react";
import { baseUrl, getRequest, postRequest } from "../utils/services";
import { io } from "socket.io-client";
import { signMessage, verifySignature } from "../utils/digitalSignature";
import { base64ToArrayBuffer } from "../utils/cryptoUtils";
import {
  generateAESKey,
  encryptMessageAES,
  decryptMessageAES,
  encryptAESKeyWithRSA,
  decryptAESKeyWithRSA,
} from "../utils/encryption";

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

  //initial socket
  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_SOCKET_URL);
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

      console.log("[Receive] ===== NHẬN TIN NHẮN MỚI =====");
      console.log("[Receive] Dữ liệu nhận được:", {
        chatId: res.chatId,
        senderId: res.senderId,
        ciphertext: res.ciphertext,
        iv: Array.from(new Uint8Array(res.iv))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
        signature: res.signature,
      });

      if (
        res.ciphertext &&
        (res.encryptedAESKeySender || res.encryptedAESKeyReceiver) &&
        res.iv
      ) {
        try {
          const isSender = res.senderId === user._id;
          console.log("[Decrypt] Bắt đầu giải mã tin nhắn...");

          // 1. Giải mã AES key
          console.log("[Decrypt] Đang giải mã AES key...");
          const encryptedAESKey = isSender
            ? res.encryptedAESKeySender
            : res.encryptedAESKeyReceiver;

          console.log("[Decrypt] AES key đã mã hóa:", encryptedAESKey);

          const aesKey = await decryptAESKeyWithRSA(
            encryptedAESKey,
            privateKey
          );

          // Convert AES key to hex để hiển thị
          const aesKeyArray = new Uint8Array(
            await crypto.subtle.exportKey("raw", aesKey)
          );
          const aesKeyHex = Array.from(aesKeyArray)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          console.log("[Decrypt] AES key đã giải mã:", aesKeyHex);

          // 2. Giải mã nội dung
          console.log("[Decrypt] Đang giải mã nội dung tin nhắn...");
          const decrypted = await decryptMessageAES(
            res.ciphertext,
            aesKey,
            res.iv
          );
          console.log("[Decrypt] Nội dung đã giải mã:", decrypted.message);

          // 3. Xác thực chữ ký
          console.log("[Verify] Đang xác thực chữ ký số...");
          let isSignatureValid = false;
          try {
            if (isSender) {
              isSignatureValid = true;
              console.log("[Verify] Tin nhắn của người gửi - bỏ qua xác thực");
            } else {
              let senderPublicKey;
              const sender = allUsers.find((u) => u._id === res.senderId);

              if (sender) {
                senderPublicKey = sender.publicKey;
                console.log(
                  "[Verify] Public key người gửi (từ cache):",
                  senderPublicKey
                );
              } else {
                console.log("[Verify] Đang lấy public key từ server...");
                const publicKeyRes = await getRequest(
                  `${baseUrl}/users/publicKey/${res.senderId}`
                );
                if (!publicKeyRes.error) {
                  senderPublicKey = publicKeyRes.publicKey;
                  console.log(
                    "[Verify] Public key người gửi (từ server):",
                    senderPublicKey
                  );
                } else {
                  console.error(
                    "[Verify] Không lấy được public key:",
                    publicKeyRes.error
                  );
                }
              }

              if (res.signature && senderPublicKey) {
                console.log("[Verify] Thông tin xác thực:", {
                  message: decrypted.message,
                  signature: res.signature,
                  publicKey: senderPublicKey,
                });
                isSignatureValid = await verifySignature(
                  decrypted.message,
                  res.signature,
                  senderPublicKey
                );
                console.log("[Verify] Kết quả xác thực:", isSignatureValid);
              } else {
                console.warn(
                  "[Verify] Không thể xác thực - thiếu chữ ký hoặc public key"
                );
              }
            }
          } catch (signError) {
            console.error("[Verify] Lỗi xác thực chữ ký:", {
              error: signError.message,
              stack: signError.stack,
            });
            isSignatureValid = false;
          }

          const newMessage = {
            ...res,
            text: decrypted.message,
            isSignatureValid,
            signature: res.signature,
          };

          console.log("[Receive] Kết quả cuối cùng:", {
            originalMessage: decrypted.message,
            isSignatureValid,
            signature: res.signature,
          });

          setMessages((prev) => [...prev, newMessage]);
          console.log("[Receive] ===== HOÀN TẤT NHẬN TIN NHẮN =====");
        } catch (err) {
          console.error("[Receive] Lỗi xử lý tin nhắn:", {
            error: err.message,
            stack: err.stack,
            chatId: res.chatId,
            senderId: res.senderId,
          });

          setMessages((prev) => [
            ...prev,
            {
              ...res,
              text: "[Không thể giải mã tin nhắn]",
              isSignatureValid: false,
            },
          ]);
        }
      } else {
        console.warn("[Receive] Tin nhắn thiếu thông tin mã hóa:", {
          hasCiphertext: !!res.ciphertext,
          hasEncryptedKey: !!(
            res.encryptedAESKeySender || res.encryptedAESKeyReceiver
          ),
          hasIV: !!res.iv,
        });
        setMessages((prev) => [...prev, { ...res, isSignatureValid: false }]);
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
  }, [socket, currentChat, privateKey, user, allUsers]);

  // Load old messages
  useEffect(() => {
    const getMessages = async () => {
      if (!currentChat?._id || !privateKey) return;
      setIsMessagesLoading(true);
      setMessagesError(null);

      try {
        const response = await getRequest(
          `${baseUrl}/messages/${currentChat._id}`
        );

        if (response.error) {
          return setMessagesError(response);
        }

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

                const aesKey = await decryptAESKeyWithRSA(
                  encryptedAESKey,
                  privateKey
                );

                const decryptedText = await decryptMessageAES(
                  msg.ciphertext,
                  aesKey,
                  msg.iv
                );

                let isSignatureValid = false;
                try {
                  if (isSender) {
                    isSignatureValid = true;
                  } else {
                    // Tìm sender trong allUsers hoặc gọi API để lấy public key
                    let senderPublicKey;
                    const sender = allUsers.find((u) => u._id === msg.senderId);
                    if (sender) {
                      senderPublicKey = sender.publicKey;
                    } else {
                      const publicKeyRes = await getRequest(
                        `${baseUrl}/users/publicKey/${msg.senderId}`
                      );
                      if (!publicKeyRes.error) {
                        senderPublicKey = publicKeyRes.publicKey;
                      }
                    }

                    if (msg.signature && senderPublicKey) {
                      isSignatureValid = await verifySignature(
                        decryptedText.message,
                        msg.signature,
                        senderPublicKey
                      );
                    }
                  }
                } catch (signError) {
                  console.error(
                    "Error verifying old message signature:",
                    signError
                  );
                  isSignatureValid = false;
                }

                return {
                  ...msg,
                  text: decryptedText.message,
                  isSignatureValid,
                };
              } catch (err) {
                console.error("Lỗi giải mã tin nhắn cũ:", err);
                return {
                  ...msg,
                  text: "[Không thể giải mã tin nhắn]",
                  isSignatureValid: false,
                };
              }
            }
            return { ...msg, isSignatureValid: false };
          })
        );

        setMessages(decryptedMessages);
      } catch (err) {
        console.error("Lỗi lấy tin nhắn:", err);
        setMessagesError({ message: "Không thể lấy tin nhắn." });
      } finally {
        setIsMessagesLoading(false);
      }
    };

    getMessages();
  }, [currentChat, privateKey, user, allUsers]);

  const sendTextMessage = useCallback(
    async (textMessage, sender, currentChatId, setTextMessage) => {
      if (!textMessage) return console.log("You must type something");

      try {
        console.log("[Send] ===== BẮT ĐẦU QUÁ TRÌNH GỬI TIN NHẮN =====");
        console.log("[Send] Nội dung gốc:", textMessage);

        // 1. Tạo chữ ký số
        console.log("[Send] Đang tạo chữ ký số...");
        const signature = await signMessage(textMessage, privateKey);
        console.log("[Send] Chữ ký số:", {
          value: signature,
          algorithm: "RSA-PSS + SHA-256",
        });

        // 2. Tạo AES key
        console.log("[Send] Đang tạo khóa AES...");
        const aesKey = await generateAESKey();
        // Convert AES key to hex để hiển thị
        const exportedKey = await crypto.subtle.exportKey("raw", aesKey);
        const aesKeyHex = Array.from(new Uint8Array(exportedKey))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        console.log("[Send] Khóa AES:", {
          key: aesKeyHex,
          algorithm: "AES-GCM 256-bit",
        });

        // 3. Mã hóa nội dung
        console.log("[Send] Đang mã hóa nội dung...");
        const { ciphertext, iv } = await encryptMessageAES(textMessage, aesKey);
        console.log("[Send] Dữ liệu đã mã hóa:", {
          ciphertext: ciphertext,
          iv: iv, // Just log the base64 string directly
        });

        // 4. Xác định người nhận
        const receiverId = currentChat?.members?.find(
          (id) => id !== sender._id
        );

        if (!receiverId) {
          console.error(
            "[Send] Không tìm thấy người nhận trong cuộc trò chuyện"
          );
          return setSendTextMessageError("Không tìm thấy người nhận.");
        }
        console.log("[Send] ID người nhận:", receiverId);

        // 5. Lấy public key người nhận
        console.log("[Send] Đang lấy public key của người nhận...");
        const publicKeyRes = await getRequest(
          `${baseUrl}/users/publicKey/${receiverId}`
        );

        if (publicKeyRes.error || !publicKeyRes.publicKey) {
          console.error(
            "[Send] Không lấy được public key người nhận:",
            publicKeyRes.error
          );
          return setSendTextMessageError(
            "Không lấy được public key người nhận."
          );
        }
        console.log("[Send] Public key người nhận:", publicKeyRes.publicKey);

        // 6. Mã hóa AES key
        console.log("[Send] Đang mã hóa AES key...");
        const encryptedAESKeyReceiver = await encryptAESKeyWithRSA(
          aesKey,
          publicKeyRes.publicKey
        );

        const encryptedAESKeySender = await encryptAESKeyWithRSA(
          aesKey,
          sender.publicKey
        );
        console.log("[Send] AES key đã mã hóa:", {
          forReceiver: encryptedAESKeyReceiver,
          forSender: encryptedAESKeySender,
        });

        // 7. Gửi tin nhắn
        console.log("[Send] Đang gửi tin nhắn đã mã hóa...");
        const messageData = {
          chatId: currentChatId,
          senderId: sender._id,
          ciphertext,
          encryptedAESKeyReceiver,
          encryptedAESKeySender,
          iv,
          signature,
        };

        const res = await postRequest(`${baseUrl}/messages`, messageData);

        if (res.error) {
          console.error("[Send] Lỗi gửi tin nhắn:", res.error);
          return setSendTextMessageError(res);
        }

        console.log("[Send] Gửi tin nhắn thành công");

        const newMessage = {
          ...res,
          text: textMessage,
          isSignatureValid: true,
          signature: res.signature,
        };

        setNewMessage(newMessage);
        setMessages((prev) => [...prev, newMessage]);
        setTextMessage("");

        console.log("[Send] ===== HOÀN TẤT GỬI TIN NHẮN =====");
      } catch (err) {
        console.error("[Send] Lỗi nghiêm trọng:", {
          error: err.message,
          stack: err.stack,
        });
        setSendTextMessageError("Gửi tin nhắn thất bại.");
      }
    },
    [currentChat, setMessages, setNewMessage, privateKey]
  );

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
