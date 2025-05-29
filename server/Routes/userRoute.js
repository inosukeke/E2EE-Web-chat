const express = require("express");
const {
  registerUser,
  loginUser,
  findUser,
  getUsers,
  getUserPublicKey,
} = require("../Controllers/userController");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/find/:userId", findUser);
router.get("/", getUsers);
router.get("/publicKey/:id", getUserPublicKey);

module.exports = router;
