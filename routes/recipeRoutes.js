// backend/routes/recipeRoutes.js
import express from "express";
import mongoose from "mongoose";
import Recipe from "../models/Recipe.js";
import requireAuth from "../middleware/requireAuth.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

/* ------------ Rate Limits ------------ */
const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

const ratingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Slow down rating requests." },
});

/* ------------ Helpers ------------ */
const getUserId = (req) => req.user?.id;
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const parseIngredients = (ingredients, ingredientsText) => {
  // รองรับ:
  // - ingredients: array (["egg","pork"])
  // - ingredients: string ("egg,pork")
  // - ingredientsText: string ("egg,pork")
  let selected = [];

  if (Array.isArray(ingredients)) {
    selected = ingredients
      .map((s) => String(s).toLowerCase().trim())
      .filter(Boolean);
  } else if (typeof ingredients === "string" && ingredients.trim()) {
    selected = ingredients
      .split(",")
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);
  } else if (ingredientsText) {
    selected = String(ingredientsText)
      .split(",")
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);
  }

  // de-dup
  selected = [...new Set(selected)];
  return selected;
};

/* ------------------------------------------------------
   ✅ Version probe (must be BEFORE any /:id routes)
------------------------------------------------------ */
router.get("/__version", (req, res) => {
  return res.json({
    ok: true,
    service: "recipes",
    version: "2025-12-21-v2",
    ts: new Date().toISOString(),
  });
});

/* ------------------------------------------------------
   ✅ POST: Create Recipe (Protected) -> POST /api/recipes
   - ใช้ cookie auth (requireAuth)
   - เซ็ต createdBy เพื่อให้ GET /my ทำงาน
------------------------------------------------------ */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    let {
      name,
      description,
      ingredients,
      ingredientsText,
      steps,
      cookingTime,
      imageUrl,
    } = req.body || {};

    name = String(name || "").trim();
    if (!name) return res.status(400).json({ message: "Recipe name is required" });

    const ingArr = parseIngredients(ingredients, ingredientsText);
    if (ingArr.length === 0) {
      return res.status(400).json({ message: "Ingredients are required" });
    }
    if (ingArr.length > 30) {
      return res.status(400).json({ message: "Too many ingredients (max 30)" });
    }

    const doc = await Recipe.create({
      name,
      description: String(description || "").trim(),
      ingredients: ingArr,
      steps: String(steps || "").trim(),
      cookingTime: cookingTime ? Number(cookingTime) : undefined,
      imageUrl: imageUrl ? String(imageUrl).trim() : undefined,
      createdBy: userId,
    });

    return res.status(201).json({ message: "Recipe created", recipe: doc });
  } catch (err) {
    console.error("Create recipe error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------
   A) Guard /search: POST only
------------------------------------------------------ */
router.all("/search", (req, res, next) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Use POST /api/recipes/search" });
  }
  return next();
});

/* ------------------------------------------------------
   B) Search (POST) — before any /:id routes
------------------------------------------------------ */
router.post("/search", async (req, res) => {
  try {
    const { ingredients, ingredientsText, matchMode } = req.body || {};
    const selected = parseIngredients(ingredients, ingredientsText);

    if (selected.length === 0) {
      return res.status(400).json({ message: "No ingredients provided" });
    }
    if (selected.length > 30) {
      return res.status(400).json({ message: "Too many ingredients (max 30)" });
    }

    const query =
      matchMode === "all"
        ? { ingredients: { $all: selected } }
        : { ingredients: { $in: selected } };

    const recipes = await Recipe.find(query).select("name ingredients imageUrl");
    return res.json({ matchedCount: recipes.length, recipes });
  } catch (err) {
    console.error("Search error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------
   ✅ GET: My Shared Recipes (Protected) — before /:id
------------------------------------------------------ */
router.get("/my", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const recipes = await Recipe.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .select("name ingredients imageUrl description steps cookingTime createdAt");

    return res.json(recipes);
  } catch (err) {
    console.error("Get my recipes error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------
   C) Param validator (only for routes that include :id)
------------------------------------------------------ */
router.param("id", (req, res, next, id) => {
  // กัน keyword ที่ไม่ควรถูกมองเป็น :id
  const reserved = new Set([
    "search",
    "my",
    "__version",
    "feedback",
    "rate",
    "comments",
  ]);
  if (reserved.has(id)) {
    return res.status(404).json({ message: "Not found" });
  }

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  return next();
});

/* ------------ GET: Feedback ------------ */
router.get("/:id/feedback", async (req, res) => {
  const { id } = req.params;

  try {
    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const ratings = recipe.ratings || [];
    const comments = recipe.comments || [];

    const ratingCount = ratings.length;
    const avgRating =
      ratingCount === 0
        ? 0
        : ratings.reduce((sum, r) => sum + r.value, 0) / ratingCount;

    return res.json({ avgRating, ratingCount, comments });
  } catch (err) {
    console.error("Feedback error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------ POST: Rate Recipe (Protected) ------------ */
router.post("/:id/rate", requireAuth, ratingLimiter, async (req, res) => {
  const { id } = req.params;

  try {
    const userId = getUserId(req);
    const value = Number(req.body?.rating);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (Number.isNaN(value) || value < 1 || value > 5) {
      return res.status(400).json({ message: "Rating must be 1–5" });
    }

    // เคยให้คะแนนแล้ว -> update
    const recipe = await Recipe.findOneAndUpdate(
      { _id: id, "ratings.user": userId },
      { $set: { "ratings.$.value": value } },
      { new: true }
    );

    // ยังไม่เคยให้คะแนน -> push
    if (!recipe) {
      const updated = await Recipe.findByIdAndUpdate(
        id,
        { $push: { ratings: { user: userId, value } } },
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: "Recipe not found" });

      const avg =
        updated.ratings.reduce((s, r) => s + r.value, 0) / updated.ratings.length;

      return res.json({
        message: "Rating saved",
        myRating: value,
        avgRating: avg,
        ratingCount: updated.ratings.length,
      });
    }

    const avgRating =
      recipe.ratings.reduce((s, r) => s + r.value, 0) / recipe.ratings.length;

    return res.json({
      message: "Rating saved",
      myRating: value,
      avgRating,
      ratingCount: recipe.ratings.length,
    });
  } catch (err) {
    console.error("Rate error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------ POST: Add Comment (Protected) ------------ */
router.post("/:id/comments", requireAuth, commentLimiter, async (req, res) => {
  const { id } = req.params;
  let { text } = req.body || {};

  if (!text || !String(text).trim()) {
    return res.status(400).json({ message: "Comment text required" });
  }

  // basic sanitize (กันแท็กดิบ)
  text = String(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");

  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const comment = {
      user: userId,
      userName: req.user?.name,
      text,
      createdAt: new Date(),
    };

    recipe.comments.push(comment);
    await recipe.save();

    return res.json({ message: "Comment added", comment });
  } catch (err) {
    console.error("Comment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------ GET: Recipe by ID (keep last) ------------ */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    return res.json(recipe);
  } catch (err) {
    console.error("Get recipe by id error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
