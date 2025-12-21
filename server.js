// backend/server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import cookieParser from "cookie-parser";

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

// ✅ Render/Proxy (แก้ express-rate-limit + X-Forwarded-For)
app.set("trust proxy", 1);

// Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);
app.use(helmet.frameguard({ action: "deny" }));
app.disable("x-powered-by");

// Body limit
app.use(express.json({ limit: "50kb" }));

// ✅ Cookie Parser (required for cookie-based auth)
app.use(cookieParser());

// ✅ FIX: Express 5 ทำ req.query เป็น getter (เขียนทับไม่ได้)
// express-mongo-sanitize พยายาม set req.query = ... เลยพัง
app.use((req, res, next) => {
  Object.defineProperty(req, "query", {
    value: { ...req.query }, // clone เป็น object ปกติ
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});

// NoSQL injection protection
app.use(mongoSanitize());
mongoose.set("strictQuery", true);

/* =========================
   ✅ CORS (Fix Preflight)
   - ต้องมี OPTIONS + methods + allowedHeaders
   - ต้องตอบ app.options("*", cors(...)) ก่อน routes
========================= */
const FRONTEND_RENDER = "https://what-will-you-cook-frontend.onrender.com";
const allowedOrigins = [
  "http://localhost:3000",
  FRONTEND_RENDER,
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // allow tools/curl ที่ไม่มี Origin
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// ✅ สำคัญ: ตอบ preflight ทุก path
app.options("*", cors(corsOptions));

/* =========================
   ✅ Rate Limit (skip OPTIONS)
========================= */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    skip: (req) => req.method === "OPTIONS",
  })
);

// Auth Rate Limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many auth requests" },
  skip: (req) => req.method === "OPTIONS",
});

/* =========================
   Routes
========================= */
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
