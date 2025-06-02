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

  console.log("notification:", notifications);
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

      console.log("[Socket] Received message details:", {
        chatId: res.chatId,
        senderId: res.senderId,
        hasSignature: !!res.signature,
        signatureValue: res.signature,
        messageFields: Object.keys(res),
      });

      if (
        res.ciphertext &&
        (res.encryptedAESKeySender || res.encryptedAESKeyReceiver) &&
        res.iv
      ) {
        try {
          const isSender = res.senderId === user._id;
          console.log("[Receive] Message processing:", {
            isSender,
            senderId: res.senderId,
            userId: user._id,
            hasEncryptedKey: !!(isSender
              ? res.encryptedAESKeySender
              : res.encryptedAESKeyReceiver),
          });

          // 1. Giải mã AES key
          const encryptedAESKey = isSender
            ? res.encryptedAESKeySender
            : res.encryptedAESKeyReceiver;

          const aesKey = await decryptAESKeyWithRSA(
            encryptedAESKey,
            privateKey
          );

          // 2. Giải mã nội dung
          const decrypted = await decryptMessageAES(
            res.ciphertext,
            aesKey,
            res.iv
          );

          console.log("[Decrypt] Message decrypted:", {
            success: true,
            messageLength: decrypted.message.length,
            messagePreview: decrypted.message.substring(0, 10) + "...",
          });

          // 3. Xác thực chữ ký với nội dung đã giải mã
          let isSignatureValid = false;
          try {
            if (isSender) {
              isSignatureValid = true;
              console.log("[Verify] Sender's own message - auto verified");
            } else {
              // Tìm sender trong allUsers hoặc gọi API để lấy public key
              let senderPublicKey;
              const sender = allUsers.find((u) => u._id === res.senderId);
              console.log("[Verify] Looking for sender:", {
                senderId: res.senderId,
                foundInCache: !!sender,
                allUserIds: allUsers.map((u) => u._id),
              });

              if (sender) {
                senderPublicKey = sender.publicKey;
                console.log("[Verify] Found sender's public key in cache");
              } else {
                console.log("[Verify] Fetching sender's public key from API");
                const publicKeyRes = await getRequest(
                  `${baseUrl}/users/publicKey/${res.senderId}`
                );
                if (!publicKeyRes.error) {
                  senderPublicKey = publicKeyRes.publicKey;
                  console.log("[Verify] Got public key from API");
                } else {
                  console.error(
                    "[Verify] Failed to get public key:",
                    publicKeyRes.error
                  );
                }
              }

              console.log("[Verify] Verification preparation:", {
                hasSignature: !!res.signature,
                signatureLength: res.signature?.length,
                hasPublicKey: !!senderPublicKey,
                publicKeyPreview: senderPublicKey
                  ? senderPublicKey.substring(0, 20) + "..."
                  : null,
                messageToVerify: decrypted.message.substring(0, 10) + "...",
              });

              if (res.signature && senderPublicKey) {
                console.log(
                  "[Verify] Attempting signature verification with:",
                  {
                    messageToVerify: decrypted.message,
                    signatureLength: res.signature.length,
                    publicKeyLength: senderPublicKey.length,
                  }
                );

                isSignatureValid = await verifySignature(
                  decrypted.message, // Sử dụng nội dung đã giải mã
                  res.signature,
                  senderPublicKey
                );

                console.log("[Verify] Verification completed:", {
                  isValid: isSignatureValid,
                  messageLength: decrypted.message.length,
                  signatureLength: res.signature.length,
                });
              } else {
                console.log("[Verify] Cannot verify - missing data:", {
                  hasSignature: !!res.signature,
                  hasPublicKey: !!senderPublicKey,
                });
              }
            }
          } catch (signError) {
            console.error("[Verify] Verification error:", {
              error: signError.message,
              stack: signError.stack,
              messageLength: decrypted?.message?.length,
              signaturePresent: !!res.signature,
            });
            isSignatureValid = false;
          }

          const newMessage = {
            ...res,
            text: decrypted.message,
            isSignatureValid,
            signature: res.signature,
          };

          console.log("[Message] Final processing state:", {
            isSender,
            isSignatureValid,
            hasSignature: !!newMessage.signature,
            messagePreview: newMessage.text.substring(0, 10) + "...",
            originalSignature: !!res.signature,
            finalSignature: !!newMessage.signature,
          });

          setMessages((prev) => [...prev, newMessage]);
        } catch (err) {
          console.error("[Error] Message processing failed:", {
            error: err.message,
            stack: err.stack,
            messageData: {
              chatId: res.chatId,
              senderId: res.senderId,
              hasSignature: !!res.signature,
            },
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
        console.log(
          "[Message] Skipping decryption - missing required fields:",
          {
            hasCiphertext: !!res.ciphertext,
            hasEncryptedKey: !!(
              res.encryptedAESKeySender || res.encryptedAESKeyReceiver
            ),
            hasIV: !!res.iv,
          }
        );
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
        console.log("[Send] Starting to send message");

        // 1. Tạo chữ ký số cho tin nhắn
        const signature = await signMessage(textMessage, privateKey);
        console.log("[Send] Created signature:", !!signature);
        console.log("[Send] Signature details:", {
          exists: !!signature,
          length: signature?.length,
          value: signature?.substring(0, 50) + "...",
        });

        // 2. Sinh AES key (random 256-bit)
        const aesKey = generateAESKey();

        // 3. Mã hóa nội dung bằng AES
        const { ciphertext, iv } = await encryptMessageAES(textMessage, aesKey);

        // 4. Xác định người nhận
        const receiverId = currentChat?.members?.find(
          (id) => id !== sender._id
        );

        if (!receiverId) {
          return setSendTextMessageError("Không tìm thấy người nhận.");
        }

        // 5. Lấy public key của người nhận
        const publicKeyRes = await getRequest(
          `${baseUrl}/users/publicKey/${receiverId}`
        );

        if (publicKeyRes.error || !publicKeyRes.publicKey) {
          return setSendTextMessageError(
            "Không lấy được public key người nhận."
          );
        }

        console.log("[Send] Got receiver's public key");

        // 6. Mã hóa AES key
        const encryptedAESKeyReceiver = await encryptAESKeyWithRSA(
          aesKey,
          publicKeyRes.publicKey
        );

        const encryptedAESKeySender = await encryptAESKeyWithRSA(
          aesKey,
          sender.publicKey
        );

        // 7. Gửi tin nhắn với chữ ký số
        const messageData = {
          chatId: currentChatId,
          senderId: sender._id,
          ciphertext,
          encryptedAESKeyReceiver,
          encryptedAESKeySender,
          iv,
          signature,
        };

        console.log("[Client] Sending message data:", {
          hasSignature: !!messageData.signature,
          signatureLength: messageData.signature?.length,
          messageFields: Object.keys(messageData),
          signatureValue: messageData.signature?.substring(0, 50) + "...",
        });

        const res = await postRequest(`${baseUrl}/messages`, messageData);

        console.log("[Client] Received response:", {
          hasSignature: !!res.signature,
          responseFields: Object.keys(res),
          signatureValue: res.signature?.substring(0, 50) + "...",
        });

        if (res.error) {
          return setSendTextMessageError(res);
        }

        console.log("[Send] Message sent successfully");

        const newMessage = {
          ...res,
          text: textMessage,
          isSignatureValid: true,
          signature: res.signature, // Explicitly set signature
        };

        console.log("[Client] Created new message:", {
          hasSignature: !!newMessage.signature,
          messageFields: Object.keys(newMessage),
          signatureValue: newMessage.signature?.substring(0, 50) + "...",
        });
        setNewMessage(newMessage);
        setMessages((prev) => [...prev, newMessage]);
        setTextMessage("");
      } catch (err) {
        console.error("[Error] Failed to send message:", err);
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
