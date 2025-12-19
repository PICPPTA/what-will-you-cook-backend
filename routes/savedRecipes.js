import express from "express";
import mongoose from "mongoose";
import SavedRecipe from "../models/SavedRecipe.js";
import Recipe from "../models/Recipe.js";
import requireAuth from "../middleware/requireAuth.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

const saveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: "Too many save actions, please slow down." },
});

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

router.use(requireAuth);

router.post("/", saveLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { recipeId } = req.body;

    if (!recipeId || !isObjectId(recipeId)) {
      return res.status(400).json({ message: "Invalid recipeId" });
    }

    const recipe = await Recipe.findById(recipeId).select("_id");
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const saved = await SavedRecipe.findOneAndUpdate(
      { user: userId, recipe: recipeId },
      { $setOnInsert: { user: userId, recipe: recipeId } },
      { new: true, upsert: true }
    );

    return res.json({ message: "Recipe saved", savedId: saved._id });
  } catch (err) {
    console.error("Save recipe error:", err);
    if (err?.code === 11000) return res.status(200).json({ message: "Already saved" });
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/:recipeId/toggle", saveLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { recipeId } = req.params;

    if (!isObjectId(recipeId)) {
      return res.status(400).json({ message: "Invalid recipeId" });
    }

    const recipe = await Recipe.findById(recipeId).select("_id");
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const existing = await SavedRecipe.findOne({ user: userId, recipe: recipeId });

    if (existing) {
      await existing.deleteOne();
      return res.json({ message: "Removed from saved recipes", saved: false });
    }

    const created = await SavedRecipe.create({ user: userId, recipe: recipeId });

    return res.json({ message: "Recipe saved", saved: true, savedId: created._id });
  } catch (err) {
    console.error("Toggle saved recipe error:", err);

    if (err?.code === 11000) {
      const doc = await SavedRecipe.findOne({
        user: req.user.id,
        recipe: req.params.recipeId,
      });
      return res.json({ message: "Recipe saved", saved: true, savedId: doc?._id });
    }

    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;

    const saved = await SavedRecipe.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("recipe", "name ingredients imageUrl");

    const recipes = saved.map((doc) => doc.recipe).filter(Boolean);

    return res.json({ count: recipes.length, recipes });
  } catch (err) {
    console.error("Get saved recipes error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!isObjectId(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const doc = await SavedRecipe.findOneAndDelete({ _id: id, user: userId });

    if (!doc) {
      return res.status(404).json({ message: "Saved recipe not found" });
    }

    return res.json({ message: "Removed from saved recipes" });
  } catch (err) {
    console.error("Delete saved recipe error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
