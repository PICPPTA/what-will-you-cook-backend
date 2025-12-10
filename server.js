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
import recipeRoutes from "./routes/recipeRoutes.js";
import savedRecipesRoutes from "./routes/savedRecipes.js";

dotenv.config();

const app = express();

/* ----------------- Security: Helmet ----------------- */
app.use(helmet());

/* ----------------- CORS ตั้งแบบปลอดภัยขึ้น ----------------- */
// origin ที่อนุญาต (เพิ่ม FRONTEND_URL ใน .env ได้เช่น https://whatwillucook.com)
const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL, // เช่น https://whatwillucook.com
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // อนุญาตทั้ง frontend จริง กับ request แบบไม่มี origin (เช่น Postman / curl)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

/* ----------------- Middleware ทั่วไป ----------------- */
app.use(express.json());

/* ----------------- Login / Auth Rate Limit ----------------- */
// กันยิง auth รัว ๆ (login/register/me)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 30,                  // IP เดิมลองได้ 30 ครั้ง/15 นาที
  message: { message: "Too many auth requests, please try again later." },
});

/* ----------------- Routes ----------------- */
// ครอบ limiter เฉพาะกลุ่ม /api/auth
app.use("/api/auth", authLimiter, authRoutes);

app.use("/api/protected", protectedRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/saved-recipes", savedRecipesRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("🍳 What Will You Cook Backend is running!");
});

/* ----------------- Connect MongoDB ----------------- */
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not set in .env");
} else {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB error:", err));
}

/* ----------------- Global error handler (เผื่ออนาคต) ----------------- */
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Server error",
  });
});

/* ----------------- Start server ----------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
