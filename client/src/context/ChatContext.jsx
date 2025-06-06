import { createContext, useState, useEffect, useCallback } from "react";
import { baseUrl, getRequest, postRequest } from "../utils/services";
import { io } from "socket.io-client";
import { signMessage, verifySignature } from "../utils/digitalSignature";
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

      console.log("[Receive] New message received:", {
        chatId: res.chatId,
        senderId: res.senderId,
        hasEncryptedContent: !!res.ciphertext,
        hasSignature: !!res.signature,
      });

      if (
        res.ciphertext &&
        (res.encryptedAESKeySender || res.encryptedAESKeyReceiver) &&
        res.iv
      ) {
        try {
          const isSender = res.senderId === user._id;
          console.log("[Decrypt] Starting decryption process:", {
            isSender,
            userId: user._id,
            senderId: res.senderId,
          });

          // 1. Giải mã AES key
          console.log("[Decrypt] Decrypting AES key...");
          const encryptedAESKey = isSender
            ? res.encryptedAESKeySender
            : res.encryptedAESKeyReceiver;

          const aesKey = await decryptAESKeyWithRSA(
            encryptedAESKey,
            privateKey
          );
          console.log("[Decrypt] AES key decrypted successfully");

          // 2. Giải mã nội dung
          console.log("[Decrypt] Decrypting message content...");
          const decrypted = await decryptMessageAES(
            res.ciphertext,
            aesKey,
            res.iv
          );
          console.log("[Decrypt] Message decrypted:", {
            messageLength: decrypted.message.length,
            messagePreview: decrypted.message.substring(0, 20) + "...",
          });

          // 3. Xác thực chữ ký
          console.log("[Verify] Starting signature verification...");
          let isSignatureValid = false;
          try {
            if (isSender) {
              isSignatureValid = true;
              console.log(
                "[Verify] Sender's own message - skipping verification"
              );
            } else {
              let senderPublicKey;
              const sender = allUsers.find((u) => u._id === res.senderId);

              if (sender) {
                senderPublicKey = sender.publicKey;
                console.log("[Verify] Found sender's public key in cache");
              } else {
                console.log(
                  "[Verify] Fetching sender's public key from server..."
                );
                const publicKeyRes = await getRequest(
                  `${baseUrl}/users/publicKey/${res.senderId}`
                );
                if (!publicKeyRes.error) {
                  senderPublicKey = publicKeyRes.publicKey;
                  console.log(
                    "[Verify] Retrieved sender's public key from server"
                  );
                } else {
                  console.error(
                    "[Verify] Failed to get public key:",
                    publicKeyRes.error
                  );
                }
              }

              if (res.signature && senderPublicKey) {
                console.log("[Verify] Verifying signature...");
                isSignatureValid = await verifySignature(
                  decrypted.message,
                  res.signature,
                  senderPublicKey
                );
                console.log(
                  "[Verify] Signature verification result:",
                  isSignatureValid
                );
              } else {
                console.warn(
                  "[Verify] Cannot verify - missing signature or public key"
                );
              }
            }
          } catch (signError) {
            console.error("[Verify] Signature verification failed:", {
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

          console.log("[Receive] Processing completed:", {
            isSignatureValid,
            messageLength: newMessage.text.length,
            messagePreview: newMessage.text.substring(0, 20) + "...",
          });

          setMessages((prev) => [...prev, newMessage]);
        } catch (err) {
          console.error("[Receive] Failed to process message:", {
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
        console.warn("[Receive] Message missing required encryption fields:", {
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
        console.log("[Send] Starting message encryption process...");
        console.log("[Send] Message details:", {
          chatId: currentChatId,
          senderId: sender._id,
          messageLength: textMessage.length,
          messagePreview: textMessage.substring(0, 20) + "...",
        });

        // 1. Tạo chữ ký số cho tin nhắn
        console.log("[Send] Creating digital signature...");
        const signature = await signMessage(textMessage, privateKey);
        console.log("[Send] Signature created:", {
          signatureLength: signature.length,
          signaturePreview: signature.substring(0, 50) + "...",
        });

        // 2. Sinh AES key (random 256-bit)
        console.log("[Send] Generating AES key...");
        const aesKey = generateAESKey();
        console.log("[Send] AES key generated");

        // 3. Mã hóa nội dung bằng AES
        console.log("[Send] Encrypting message with AES...");
        const { ciphertext, iv } = await encryptMessageAES(textMessage, aesKey);
        console.log("[Send] Message encrypted:", {
          ciphertextLength: ciphertext.length,
          ivLength: iv.length,
        });

        // 4. Xác định người nhận
        const receiverId = currentChat?.members?.find(
          (id) => id !== sender._id
        );

        if (!receiverId) {
          console.error("[Send] Receiver not found in chat members");
          return setSendTextMessageError("Không tìm thấy người nhận.");
        }
        console.log("[Send] Receiver identified:", receiverId);

        // 5. Lấy public key của người nhận
        console.log("[Send] Fetching receiver's public key...");
        const publicKeyRes = await getRequest(
          `${baseUrl}/users/publicKey/${receiverId}`
        );

        if (publicKeyRes.error || !publicKeyRes.publicKey) {
          console.error(
            "[Send] Failed to get receiver's public key:",
            publicKeyRes.error
          );
          return setSendTextMessageError(
            "Không lấy được public key người nhận."
          );
        }
        console.log("[Send] Received public key successfully");

        // 6. Mã hóa AES key cho cả người gửi và người nhận
        console.log("[Send] Encrypting AES key for both parties...");
        const encryptedAESKeyReceiver = await encryptAESKeyWithRSA(
          aesKey,
          publicKeyRes.publicKey
        );

        const encryptedAESKeySender = await encryptAESKeyWithRSA(
          aesKey,
          sender.publicKey
        );
        console.log("[Send] AES key encrypted for both parties");

        // 7. Gửi tin nhắn với chữ ký số
        console.log("[Send] Preparing message data for sending...");
        const messageData = {
          chatId: currentChatId,
          senderId: sender._id,
          ciphertext,
          encryptedAESKeyReceiver,
          encryptedAESKeySender,
          iv,
          signature,
        };

        console.log("[Send] Sending encrypted message to server...");
        const res = await postRequest(`${baseUrl}/messages`, messageData);

        if (res.error) {
          console.error("[Send] Failed to send message:", res.error);
          return setSendTextMessageError(res);
        }

        console.log("[Send] Message sent successfully");

        const newMessage = {
          ...res,
          text: textMessage,
          isSignatureValid: true,
          signature: res.signature,
        };

        setNewMessage(newMessage);
        setMessages((prev) => [...prev, newMessage]);
        setTextMessage("");

        console.log("[Send] Local message state updated");
      } catch (err) {
        console.error("[Send] Critical error while sending message:", {
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
