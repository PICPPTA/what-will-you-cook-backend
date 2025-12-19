// backend/models/SavedRecipe.js
import mongoose from "mongoose";

const SavedRecipeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipe: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// ป้องกันเซฟรายการเดิมซ้ำซ้อน เช่น user 1 บันทึก recipe 1 ซ้ำ
SavedRecipeSchema.index({ user: 1, recipe: 1 }, { unique: true });

const SavedRecipe = mongoose.model("SavedRecipe", SavedRecipeSchema);
export default SavedRecipe;
