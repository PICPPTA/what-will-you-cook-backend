// backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";

export default function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  // รองรับทั้งรูปแบบ "Bearer xxx" และส่งมาเป็น token ตรง ๆ
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // เผื่อกรณีเก่าที่ใช้ userId แทน id
    const id = decoded.id || decoded.userId;

    req.user = {
      id,
      email: decoded.email,
      name: decoded.name,
    };

    if (!req.user.id) {
      // ถ้าไม่มี id เลย ให้ถือว่า token ไม่ถูกต้อง
      return res.status(401).json({ message: "Invalid token payload" });
    }

    next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
}
