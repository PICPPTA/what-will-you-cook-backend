import jwt from "jsonwebtoken";

/**
 * Auth middleware (Cookie-based JWT)
 * - อ่าน token จาก httpOnly cookie
 * - verify JWT
 * - แนบ req.user ให้ route ใช้งานต่อ
 */
export default function requireAuth(req, res, next) {
  try {
    // 1) อ่าน token จาก cookie
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 2) ตรวจสอบ JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3) แนบข้อมูล user กับ request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role ?? "user",
    };

    // 4) ผ่าน → ไป route ต่อ
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
