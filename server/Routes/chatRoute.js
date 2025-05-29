const express = require("express");
const {
  createChat,
  findChat,
  findUserChats,
} = require("../Controllers/chatController");

const router = express.Router();

router.post("/", createChat);
router.get("/:userId", findUserChats);
router.get("/find/:firstId/:secondId", findChat);

module.exports = router;
