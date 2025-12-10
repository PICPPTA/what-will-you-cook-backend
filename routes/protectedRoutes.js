// backend/routes/protectedRoutes.js
import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import User from "../models/User.js";

const router = express.Router();

// ทดสอบ token เฉย ๆ (ถ้ามีอยู่แล้วไม่ต้องซ้ำ)
router.get("/", authMiddleware, (req, res) => {
  res.json({ message: "Protected route", user: req.user });
});

// ✅ ดึงข้อมูลโปรไฟล์ของ user ที่ล็อกอินอยู่
router.get("/me", authMiddleware, async (req, res) => {
  try {
    // ดูให้ตรงกับที่เราเก็บตอน sign JWT นะ
    // ถ้าใน authMiddleware เซ็ตเป็น req.user.id ก็ใช้ id แทน
    const userId = req.user.userId || req.user.id;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ใส่ field เพิ่มเองได้ตาม schema จริงของเรา
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        // ถ้ายังไม่มี field นี้ใน schema ก็ใช้ค่าคงที่ไปก่อน
        followers: 0,
        following: 0,
        recipesShared: 0,
        bio:
          user.bio ||
          "Home cook who loves experimenting with new recipes!",
        avatar:
          user.avatar ||
          "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop",
      },
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
