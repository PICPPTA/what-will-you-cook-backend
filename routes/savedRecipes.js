// backend/routes/savedRecipes.js
import express from "express";
import mongoose from "mongoose";
import SavedRecipe from "../models/SavedRecipe.js";
import Recipe from "../models/Recipe.js";
import requireAuth from "../middleware/requireAuth.js"; // ✅ change
import rateLimit from "express-rate-limit";

const router = express.Router();

/* ------------------- Rate Limit ------------------- */
const saveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: "Too many save actions, please slow down." },
});

/* ------------------- Helper ------------------- */
function getUserId(req) {
  return req.user?.id;
}
function validateObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/* ------------------- POST: Save Recipe ------------------- */
router.post("/", requireAuth, saveLimiter, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { recipeId } = req.body;

    if (!recipeId || !validateObjectId(recipeId))
      return res.status(400).json({ message: "Invalid recipeId" });

    const recipe = await Recipe.findById(recipeId);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    let saved = await SavedRecipe.findOne({ user: userId, recipe: recipeId });
    if (!saved) {
      saved = await SavedRecipe.create({ user: userId, recipe: recipeId });
    }

    return res.json({ message: "Recipe saved", savedId: saved._id });
  } catch (err) {
    console.error("Save recipe error:", err);
    if (err.code === 11000)
      return res.status(200).json({ message: "Already saved" });

    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------- POST: Toggle Save ------------------- */
router.post("/:recipeId/toggle", requireAuth, saveLimiter, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { recipeId } = req.params;

    if (!validateObjectId(recipeId))
      return res.status(400).json({ message: "Invalid recipeId" });

    const recipe = await Recipe.findById(recipeId);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const existing = await SavedRecipe.findOne({ user: userId, recipe: recipeId });

    if (existing) {
      await existing.deleteOne();
      return res.json({ message: "Removed from saved recipes", saved: false });
    }

    const created = await SavedRecipe.create({ user: userId, recipe: recipeId });

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

/* ------------------- GET: All Saved Recipes ------------------- */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);

    const saved = await SavedRecipe.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("recipe", "name ingredients");

    const recipes = saved.map((doc) => doc.recipe).filter(Boolean);

    res.json({ count: recipes.length, recipes });
  } catch (err) {
    console.error("Get saved recipes error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------- DELETE ------------------- */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!validateObjectId(id))
      return res.status(400).json({ message: "Invalid id" });

    const doc = await SavedRecipe.findOneAndDelete({ _id: id, user: userId });

    if (!doc)
      return res.status(404).json({ message: "Saved recipe not found" });

    res.json({ message: "Removed from saved recipes" });
  } catch (err) {
    console.error("Delete saved recipe error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
