// backend/routes/recipeRoutes.js
import express from "express";
import mongoose from "mongoose";
import Recipe from "../models/Recipe.js";
import authMiddleware from "../middleware/authMiddleware.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

/* ------------ Rate Limits ------------ */
const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { message: "Too many requests, please try again later." },
});

const ratingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: "Slow down rating requests." },
});

/* ------------ Helper ------------ */
const getUserId = (req) => req.user?.id;
const isIdValid = (id) => mongoose.Types.ObjectId.isValid(id);

/* ------------ POST: Search Recipes ------------ */
router.post("/search", async (req, res) => {
  try {
    let { ingredients, ingredientsText, matchMode } = req.body;

    let selected = [];

    if (Array.isArray(ingredients)) {
      selected = ingredients.map((s) => s.toLowerCase().trim()).filter(Boolean);
    } else if (ingredientsText) {
      selected = ingredientsText
        .split(",")
        .map((s) => s.toLowerCase().trim())
        .filter(Boolean);
    }

    if (selected.length === 0) {
      return res.status(400).json({ message: "No ingredients provided" });
    }

    // ป้องกัน misuse
    if (selected.length > 30) {
      return res.status(400).json({ message: "Too many ingredients (max 30)" });
    }

    const query =
      matchMode === "all"
        ? { ingredients: { $all: selected } }
        : { ingredients: { $in: selected } };

    const recipes = await Recipe.find(query).select("name ingredients imageUrl");

    res.json({
      matchedCount: recipes.length,
      recipes,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



/* ------------ GET: Feedback ------------ */
router.get("/:id/feedback", async (req, res) => {
  const { id } = req.params;
  if (!isIdValid(id)) return res.status(400).json({ message: "Invalid id" });

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

    res.json({ avgRating, ratingCount, comments });
  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------ POST: Rate Recipe ------------ */
router.post("/:id/rate", authMiddleware, ratingLimiter, async (req, res) => {
  const { id } = req.params;
  if (!isIdValid(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const userId = getUserId(req);
    const value = Number(req.body.rating);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (value < 1 || value > 5)
      return res.status(400).json({ message: "Rating must be 1–5" });

    // ป้องกัน race condition ด้วย findOneAndUpdate + upsert
    const recipe = await Recipe.findOneAndUpdate(
      { _id: id, "ratings.user": userId },
      { $set: { "ratings.$.value": value } },
      { new: true }
    );

    if (!recipe) {
      const updated = await Recipe.findByIdAndUpdate(
        id,
        { $push: { ratings: { user: userId, value } } },
        { new: true }
      );
      return res.json({
        message: "Rating saved",
        myRating: value,
        avgRating:
          updated.ratings.reduce((s, r) => s + r.value, 0) /
          updated.ratings.length,
        ratingCount: updated.ratings.length,
      });
    }

    const ratings = recipe.ratings;
    const avgRating =
      ratings.reduce((s, r) => s + r.value, 0) / ratings.length;

    res.json({
      message: "Rating saved",
      myRating: value,
      avgRating,
      ratingCount: ratings.length,
    });
  } catch (err) {
    console.error("Rate error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------ POST: Add Comment ------------ */
router.post("/:id/comments", authMiddleware, commentLimiter, async (req, res) => {
  const { id } = req.params;
  let { text } = req.body;

  if (!isIdValid(id)) return res.status(400).json({ message: "Invalid id" });

  if (!text || !text.trim())
    return res.status(400).json({ message: "Comment text required" });

  // Sanitize text
  text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const comment = {
      user: userId,
      userName: req.user.name,
      text,
      createdAt: new Date(),
    };

    recipe.comments.push(comment);
    await recipe.save();

    res.json({ message: "Comment added", comment });
  } catch (err) {
    console.error("Comment error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------ GET: Recipe by ID (วางท้ายสุด) ------------ */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isIdValid(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    res.json(recipe);
  } catch (err) {
    console.error("Get recipe error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
