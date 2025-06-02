const messageModel = require("../Models/messageModel");
const userModel = require("../Models/userModel");

//createMessage
const createMessage = async (req, res) => {
  console.log("[MessageController] Starting message creation...");

  const {
    chatId,
    senderId,
    ciphertext,
    encryptedAESKeyReceiver,
    encryptedAESKeySender,
    iv,
    signature,
  } = req.body;

  console.log("[Server] Received message data:", {
    hasSignature: !!signature,
    signatureLength: signature?.length,
    messageFields: Object.keys(req.body),
    signatureValue: signature?.substring(0, 50) + "...",
    fullBody: req.body,
  });

  try {
    // Verify sender exists
    console.log("[MessageController] Finding sender with ID:", senderId);
    const sender = await userModel.findById(senderId);
    if (!sender) {
      console.log("[MessageController] Sender not found:", senderId);
      return res.status(400).json({ error: "Sender not found" });
    }
    console.log("[MessageController] Found sender:", sender._id);

    console.log("[MessageController] Creating message model...");
    const message = new messageModel({
      chatId,
      senderId,
      ciphertext,
      encryptedAESKeyReceiver,
      encryptedAESKeySender,
      iv,
      signature,
    });

    console.log("[Server] Created message model:", {
      hasSignature: !!message.signature,
      modelFields: Object.keys(message.toObject()),
      signatureValue: message.signature?.substring(0, 50) + "...",
      fullMessage: message.toObject(),
    });

    console.log("[MessageController] Saving message to database...");
    const savedMessage = await message.save();
    console.log(
      "[MessageController] Message saved successfully:",
      savedMessage._id
    );

    console.log("[Server] Saved message:", {
      hasSignature: !!savedMessage.signature,
      savedFields: Object.keys(savedMessage.toObject()),
      signatureValue: savedMessage.signature?.substring(0, 50) + "...",
      fullMessage: savedMessage.toObject(),
    });

    // Log the response before sending
    console.log("[Server] Sending response:", {
      hasSignature: !!savedMessage.signature,
      responseFields: Object.keys(savedMessage.toObject()),
      signatureValue: savedMessage.signature?.substring(0, 50) + "...",
    });

    res.status(200).json(savedMessage);
  } catch (error) {
    console.log("[MessageController] Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json(error);
  }
};

//getMessage
const getMessages = async (req, res) => {
  const { chatId } = req.params;
  console.log("[MessageController] Getting messages for chat:", chatId);

  try {
    const messages = await messageModel.find({ chatId });
    console.log("[MessageController] Found messages count:", messages.length);

    console.log(
      "[Server] Retrieved messages:",
      messages.map((msg) => ({
        id: msg._id,
        hasSignature: !!msg.signature,
        fields: Object.keys(msg.toObject()),
        signatureValue: msg.signature?.substring(0, 50) + "...",
      }))
    );

    res.status(200).json(messages);
  } catch (error) {
    console.log("[MessageController] Error getting messages:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json(error);
  }
};

module.exports = { createMessage, getMessages };
