// backend/middleware/requireAuth.js
import jwt from "jsonwebtoken";

export default function requireAuth(req, res, next) {
  try {
    // 1) อ่านจาก httpOnly cookie ก่อน
    const cookieToken = req.cookies?.token;

    // 2) fallback: Authorization: Bearer <token>
    const auth = req.headers.authorization || "";
    const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    const token = cookieToken || headerToken;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // decoded จะมี { id, email, name, role, iat, exp }
    req.user = decoded;

    return next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}
