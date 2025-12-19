// backend/server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";

import authRoutes from "./routes/authRoutes.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import recipeRoutes from "./routes/recipeRoutes.js";
import savedRecipesRoutes from "./routes/savedRecipes.js";

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error("❌ Missing JWT_SECRET");
  process.exit(1);
}

const app = express();

// Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);
app.use(helmet.frameguard({ action: "deny" }));
app.disable("x-powered-by");

// Anti-JSON attack
app.use(express.json({ limit: "50kb" }));

// NoSQL injection protection
app.use(mongoSanitize());
mongoose.set("strictQuery", true);

// CORS
const FRONTEND_RENDER = "https://what-will-you-cook-frontend.onrender.com";
const allowedOrigins = [
  "http://localhost:3000",
  FRONTEND_RENDER,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// Global Rate Limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
  })
);

// Auth Rate Limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many auth requests" },
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/protected", protectedRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/saved-recipes", savedRecipesRoutes);

app.get("/", (req, res) => {
  res.send("🍳 What Will You Cook Backend is running!");
});

// MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(err.status || 500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
