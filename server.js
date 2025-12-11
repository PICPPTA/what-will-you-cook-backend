// backend/server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

// 🔹 Import routes
import authRoutes from "./routes/authRoutes.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import recipeRoutes from "./routes/recipeRoutes.js";   // ✔ แก้ path ที่ถูกต้อง
import savedRecipesRoutes from "./routes/savedRecipes.js";

dotenv.config();

const app = express();

/* ----------------- Security: Helmet ----------------- */
app.use(helmet());

/* ----------------- CORS ตั้งค่าแบบอนุญาต Frontend จริง ----------------- */

// ใส่ frontend ของคุณลงไปตรงนี้ (Render URL)
const FRONTEND_RENDER = "https://what-will-you-cook-frontend.onrender.com";

const allowedOrigins = [
  "http://localhost:3000",
  FRONTEND_RENDER,
  process.env.FRONTEND_URL, // optional
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman/curl ok
      if (allowedOrigins.includes(origin)) return callback(null, true);

      console.log("❌ CORS blocked:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

/* ----------------- Middleware ----------------- */
app.use(express.json());

/* ----------------- Rate Limit ----------------- */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many auth requests, please try again later." },
});

/* ----------------- Routes ----------------- */
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/protected", protectedRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/saved-recipes", savedRecipesRoutes);

app.get("/", (req, res) => {
  res.send("🍳 What Will You Cook Backend is running!");
});

/* ----------------- Connect MongoDB ----------------- */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

/* ----------------- Global Error Handler ----------------- */
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Server error",
  });
});

/* ----------------- Start server ----------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
