const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatId: String,
    senderId: String,
    ciphertext: String,
    encryptedAESKeyReceiver: String,
    encryptedAESKeySender: String,
    iv: String,
  },
  {
    timestamps: true,
  }
);

const messageModel = mongoose.model("Message", messageSchema);
module.exports = messageModel;
