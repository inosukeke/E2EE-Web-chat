const chatModel = require("../Models/chatModule");
// createChat
// findUserChat
// findChat
const createChat = async (req, res) => {
  const { firstId, secondId } = req.body; //destructuring

  try {
    const chat = await chatModel.findOne({
      members: { $all: [firstId, secondId] }, //SELECT * FROM chats WHERE members CONTAINS firstId AND secondId;
    });

    if (chat) return res.status(200).json(chat);

    const newChat = new chatModel({
      members: [firstId, secondId],
    });

    const response = await newChat.save(); // save chat to db
    res.status(200).json(response); //and send to FE
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
};

//findUserChat

const findUserChats = async (req, res) => {
  const userId = req.params.userId;

  try {
    const chats = await chatModel.find({
      members: { $in: [userId] }, //SELECT * FROM chats WHERE userId IN (member);
    });
    res.status(200).json(chats);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
};

//findChat
const findChat = async (req, res) => {
  const { firstId, secondId } = req.params;

  try {
    const chat = await chatModel.findOne({
      members: { $all: [firstId, secondId] },
    });
    res.status(200).json(chat);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
};

module.exports = { createChat, findUserChats, findChat };
