// backend/routes/authRoutes.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

const INVALID_MSG = "Invalid email or password";
const REG_INVALID_MSG = "Invalid registration data";

// Helper: cookie options (ใช้ทั้ง login + logout ให้ consistent)
function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // ✅ production (ข้ามโดเมนได้): none / dev: lax
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  };
}

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: REG_INVALID_MSG });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ message: REG_INVALID_MSG });

    if (password.length < 6)
      return res.status(400).json({ message: REG_INVALID_MSG });

    const exists = await User.findOne({ email });
    if (exists) {
      // no email leak
      return res.status(400).json({ message: REG_INVALID_MSG });
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
      { id: user._id, email: user.email, name: user.name, role: user.role ?? "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // ✅ set httpOnly cookie (cross-domain ready in production)
    const cookieOptions = getCookieOptions();
    res.cookie("token", token, cookieOptions);

    res.json({
      message: "Login successful",
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ME (ตรวจสถานะ login)
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// LOGOUT (ลบ cookie)
router.post("/logout", (req, res) => {
  const cookieOptions = getCookieOptions();
  res.clearCookie("token", cookieOptions);
  res.json({ message: "Logged out" });
});

export default router;
