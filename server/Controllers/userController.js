const userModel = require("../Models/userModel");
const bcrypt = require("bcrypt");
const validator = require("validator");
const jwt = require("jsonwebtoken");

const createToken = (_id) => {
  const jwtkey = process.env.JWT_SECRET_KEY;

  return jwt.sign({ _id }, jwtkey, { expiresIn: "3d" });
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, publicKey } = req.body;

    let user = await userModel.findOne({ email });
    // Tìm một bản ghi trong database.Nếu tìm thấy → trả về object.Nếu không có → trả về null.
    if (user)
      return res.status(400).json("User with the given email already exist");

    if (!name || !email || !password)
      return res.status(400).json("All fields are required");

    if (!validator.isEmail(email))
      return res.status(400).json("Email must be valid");

    if (!validator.isStrongPassword(password))
      return res.status(400).json("Your password is not strong enough");

    user = new userModel({ name, email, password, publicKey });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);

    await user.save();

    const token = createToken(user._id);

    res.status(200).json({ _id: user._id, name, email, token, publicKey });
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await userModel.findOne({ email });

    if (!user) return res.status(400).json("Invalid email or password");
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword)
      return res.status(400).json("Invalid email or password");
    const token = createToken(user._id);

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email,
      publicKey: user.publicKey,
      token,
    });
  } catch (error) {}
};

const findUser = async (req, res) => {
  const userId = req.params.userId;
  try {
    const user = await userModel.findById(userId);

    res.status(200).json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await userModel.find();

    res.status(200).json(users);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
};

const getUserPublicKey = async (req, res) => {
  try {
    const user = await userModel.findById(req.params.id).select("publicKey");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ publicKey: user.publicKey });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
module.exports = {
  registerUser,
  loginUser,
  findUser,
  getUsers,
  getUserPublicKey,
};
