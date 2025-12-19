// routes/recipeRoutes.js
import express from "express";
import mongoose from "mongoose";
import Recipe from "../models/Recipe.js";
import requireAuth from "../middleware/requireAuth.js"; // cookie-based auth
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

/* ------------ Helpers ------------ */
const getUserId = (req) => req.user?.id;
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ------------------------------------------------------
   1) Guard /search: ต้องเป็น POST เท่านั้น (กันคนยิง GET)
------------------------------------------------------ */
router.all("/search", (req, res, next) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Use POST /api/recipes/search" });
  }
  return next();
});

/* ------------------------------------------------------
   2) Search (POST) — วางไว้ก่อน route ที่มี :id เสมอ
------------------------------------------------------ */
router.post("/search", async (req, res) => {
  try {
    let { ingredients, ingredientsText, matchMode } = req.body;

    let selected = [];

    if (Array.isArray(ingredients)) {
      selected = ingredients
        .map((s) => String(s).toLowerCase().trim())
        .filter(Boolean);
    } else if (ingredientsText) {
      selected = String(ingredientsText)
        .split(",")
        .map((s) => s.toLowerCase().trim())
        .filter(Boolean);
    }

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
   3) Param validator: กัน id ที่ไม่ใช่ ObjectId ก่อนเข้าทุก route ที่ใช้ :id
   - ต่อให้มีคนยิง GET /api/recipes/search แล้วมันเผลอชน :id
     ตัวนี้จะหยุดก่อนถึง findById ทำให้ CastError หายชัวร์
------------------------------------------------------ */
router.param("id", (req, res, next, id) => {
  // ถ้า id เป็นคำที่มักชน route เช่น search -> บอกให้ใช้ endpoint ที่ถูก
  if (id === "search") {
    return res.status(405).json({ message: "Use POST /api/recipes/search" });
  }

  if (!isObjectId(id)) {
    // เลือก 400 หรือ 404 ได้; แนะนำ 400 เพื่อบอกว่า format ผิด
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
    const value = Number(req.body.rating);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (Number.isNaN(value) || value < 1 || value > 5) {
      return res.status(400).json({ message: "Rating must be 1–5" });
    }

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
  let { text } = req.body;

  if (!text || !String(text).trim()) {
    return res.status(400).json({ message: "Comment text required" });
  }

  text = String(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
