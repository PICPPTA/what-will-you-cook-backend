// backend/routes/savedRecipes.js
import express from "express";
import SavedRecipe from "../models/SavedRecipe.js";
import Recipe from "../models/Recipe.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /api/saved-recipes
 * บันทึกเมนูที่ user เซฟ (idempotent – เซฟซ้ำไม่ error)
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not found in token" });
    }

    const { recipeId } = req.body;

    if (!recipeId) {
      return res.status(400).json({ message: "recipeId is required" });
    }

    // ตรวจสอบว่า recipe มีจริงไหม
    const recipe = await Recipe.findById(recipeId);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    // กันไม่ให้เซฟซ้ำ
    let saved = await SavedRecipe.findOne({ user: userId, recipe: recipeId });
    if (!saved) {
      saved = await SavedRecipe.create({
        user: userId,
        recipe: recipeId,
      });
    }

    return res.json({
      message: "Recipe saved",
      savedId: saved._id,
    });
  } catch (err) {
    console.error("Save recipe error:", err);
    if (err.code === 11000) {
      return res.status(200).json({ message: "Already saved" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ NEW: POST /api/saved-recipes/:recipeId/toggle
 * - ถ้ายังไม่เซฟ → เซฟให้
 * - ถ้าเซฟแล้ว → ยกเลิกการเซฟ
 */
router.post("/:recipeId/toggle", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { recipeId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "User not found in token" });
    }

    if (!recipeId) {
      return res.status(400).json({ message: "recipeId is required" });
    }

    // ตรวจสอบว่า recipe มีจริงไหม
    const recipe = await Recipe.findById(recipeId);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    const existing = await SavedRecipe.findOne({
      user: userId,
      recipe: recipeId,
    });

    if (existing) {
      // เคยเซฟแล้ว → ลบออก
      await existing.deleteOne();
      return res.json({
        message: "Removed from saved recipes",
        saved: false,
      });
    }

    // ยังไม่เซฟ → สร้างใหม่
    const created = await SavedRecipe.create({
      user: userId,
      recipe: recipeId,
    });

    return res.json({
      message: "Recipe saved",
      saved: true,
      savedId: created._id,
    });
  } catch (err) {
    console.error("Toggle saved recipe error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/saved-recipes
 * ดึงเมนูทั้งหมดที่ user เซฟ
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not found in token" });
    }

    const saved = await SavedRecipe.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("recipe"); // ดึงข้อมูลเมนูเต็ม ๆ

    const recipes = saved
      .map((doc) => doc.recipe)
      .filter(Boolean); // กัน null เผื่อมี recipe ถูกลบไปแล้ว

    res.json({
      count: recipes.length,
      recipes,
    });
  } catch (err) {
    console.error("Get saved recipes error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/saved-recipes/:id
 * ยกเลิกการเซฟเมนูจาก _id ของ SavedRecipe (OPTIONAL ใช้ทีหลังก็ได้)
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { id } = req.params;

    const doc = await SavedRecipe.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!doc) {
      return res.status(404).json({ message: "Saved recipe not found" });
    }

    res.json({ message: "Removed from saved recipes" });
  } catch (err) {
    console.error("Delete saved recipe error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
