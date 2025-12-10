// backend/models/Recipe.js
import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    value: { type: Number, min: 1, max: 5 },
  },
  { _id: false }
);

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: String,
    text: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const recipeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    imageUrl: String, // URL รูปอาหาร
    ingredients: [{ type: String, required: true }],
    steps: String,
    cookingTime: Number,
    // 🟢 คนสร้างเมนู
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    ratings: [ratingSchema],
    comments: [commentSchema],
  },
  { timestamps: true }
);

const Recipe = mongoose.model("Recipe", recipeSchema);
export default Recipe;
