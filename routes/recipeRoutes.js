// backend/routes/recipeRoutes.js
import express from "express";
import Recipe from "../models/Recipe.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /api/recipes
 * เพิ่มเมนูใหม่ – แปลง ingredients string → array (lowercase)
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, ingredients, steps, cookingTime, imageUrl } = req.body;

    if (!name || !ingredients) {
      return res
        .status(400)
        .json({ message: "Name and ingredients are required" });
    }

    // แปลง string → array + ทำเป็นตัวเล็ก
    const ingredientsArray = String(ingredients)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    // ดึง userId จาก token
    const userId =
      req.user?.id || req.user?._id || req.user?.userId || req.user?.uid;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: no user in token" });
    }

    const recipe = await Recipe.create({
      name,
      ingredients: ingredientsArray,
      steps,
      cookingTime,
      imageUrl: imageUrl?.trim() || "", // เก็บ URL รูป (ถ้าไม่ส่งมาก็เป็น string ว่าง)
      createdBy: userId, // ผูกเจ้าของเมนู
    });

    res.json({
      message: "Recipe created",
      recipe,
    });
  } catch (err) {
    console.error("Create recipe error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/recipes/my
 * ดึงเมนูที่ user คนนี้สร้างเอง
 */
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const userId =
      req.user?.id || req.user?._id || req.user?.userId || req.user?.uid;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: no user in token" });
    }

    const recipes = await Recipe.find({ createdBy: userId }).sort({
      createdAt: -1,
    });

    res.json(recipes);
  } catch (err) {
    console.error("Get my recipes error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/recipes/search
 * ค้นหาจาก ingredients (โหมด any/all)
 */
router.post("/search", async (req, res) => {
  try {
    const { ingredients, ingredientsText, matchMode } = req.body;

    let selected = [];

    if (Array.isArray(ingredients) && ingredients.length > 0) {
      selected = ingredients
        .map((s) => String(s).trim().toLowerCase())
        .filter(Boolean);
    } else if (ingredientsText) {
      selected = String(ingredientsText)
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);
    }

    if (selected.length === 0) {
      return res.status(400).json({ message: "No ingredients provided" });
    }

    const query =
      matchMode === "all"
        ? { ingredients: { $all: selected } } // ต้องมีครบทุกตัว
        : { ingredients: { $in: selected } }; // มีสักตัวก็ได้

    const recipes = await Recipe.find(query);

    res.json({
      matchedCount: recipes.length,
      recipes,
    });
  } catch (err) {
    console.error("Search recipes error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/recipes/:id
 * ดึงเมนูทีละอันสำหรับหน้า recipe detail
 */
router.get("/:id", async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    res.json(recipe);
  } catch (err) {
    console.error("Get recipe by id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/recipes/:id/feedback
 * ดึง avgRating + ratingCount + comments
 */
router.get("/:id/feedback", async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    const ratings = recipe.ratings || [];
    const comments = recipe.comments || [];

    const ratingCount = ratings.length;
    const avgRating =
      ratingCount === 0
        ? 0
        : ratings.reduce((sum, r) => sum + (r.value || 0), 0) / ratingCount;

    res.json({
      avgRating,
      ratingCount,
      comments,
    });
  } catch (err) {
    console.error("Get feedback error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/recipes/:id/rate
 * ให้คะแนน 1–5 ดาว (ต้อง login)
 */
router.post("/:id/rate", authMiddleware, async (req, res) => {
  try {
    const { rating } = req.body;
    const value = Number(rating);

    if (!value || value < 1 || value > 5) {
      return res.status(400).json({ message: "Rating must be 1–5" });
    }

    const userId =
      req.user?.id || req.user?._id || req.user?.userId || req.user?.uid;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: user info not found in token" });
    }

    const recipe = await Recipe.findById(req.params.id);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    recipe.ratings = recipe.ratings || [];

    // ถ้ามี rating เก่าของ user นี้แล้ว ให้ update แทน
    const existing = recipe.ratings.find(
      (r) => String(r.user) === String(userId)
    );

    if (existing) {
      existing.value = value;
    } else {
      recipe.ratings.push({
        user: userId,
        value,
      });
    }

    await recipe.save();

    const ratings = recipe.ratings || [];
    const ratingCount = ratings.length;
    const avgRating =
      ratingCount === 0
        ? 0
        : ratings.reduce((sum, r) => sum + (r.value || 0), 0) / ratingCount;

    res.json({
      message: "Rating saved",
      myRating: value,
      avgRating,
      ratingCount,
    });
  } catch (err) {
    console.error("Rate recipe error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/recipes/:id/comments
 * เพิ่มคอมเมนต์ (ต้อง login)
 */
router.post("/:id/comments", authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const userId =
      req.user?.id || req.user?._id || req.user?.userId || req.user?.uid;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: user info not found in token" });
    }

    const recipe = await Recipe.findById(req.params.id);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    recipe.comments = recipe.comments || [];

    const comment = {
      user: userId,
      userName: req.user?.name || req.user?.email || "User",
      text: text.trim(),
      createdAt: new Date(),
    };

    recipe.comments.push(comment);
    await recipe.save();

    const savedComment = recipe.comments[recipe.comments.length - 1];

    res.json({
      message: "Comment added",
      comment: savedComment,
    });
  } catch (err) {
    console.error("Add comment error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
