// backend/routes/protectedRoutes.js
import express from "express";
import requireAuth from "../middleware/requireAuth.js"; // ✅ change
import User from "../models/User.js";
import xss from "xss";

const router = express.Router();

// Protected test
router.get("/", requireAuth, (req, res) => {
  res.json({ message: "Protected route", user: req.user });
});

// Profile
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      user: {
        id: user._id,
        name: xss(user.name),
        email: xss(user.email),
        bio: xss(user.bio || "Home cook who loves experimenting!"),
        avatar:
          user.avatar ||
          "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop",
        followers: 0,
        following: 0,
        recipesShared: 0,
      },
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
