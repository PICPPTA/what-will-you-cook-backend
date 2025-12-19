// backend/routes/authRoutes.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

const INVALID_MSG = "Invalid email or password";

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "Invalid registration data" });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ message: "Invalid registration data" });

    if (password.length < 6)
      return res.status(400).json({ message: "Invalid registration data" });

    const exists = await User.findOne({ email });

    if (exists) {
      return res
        .status(400)
        .json({ message: "Invalid registration data" }); // no email leak
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = await User.create({ name, email, password: hashed });

    res.json({
      message: "User registered successfully",
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: INVALID_MSG });

    const user = await User.findOne({ email });

    if (!user) {
      // dummy hashing prevents timing attack
      await bcrypt.compare(password, "$2a$10$invalidsaltinvalidsaltinv");
      return res.status(400).json({ message: INVALID_MSG });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: INVALID_MSG });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
