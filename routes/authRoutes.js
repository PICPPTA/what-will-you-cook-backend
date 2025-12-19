// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: INVALID_MSG });

    const user = await User.findOne({ email });

    if (!user) {
      // dummy hashing prevents timing attack
      await bcrypt.compare(password, "$2a$10$invalidsaltinvalidsaltinv");
      return res.status(400).json({ message: INVALID_MSG });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: INVALID_MSG });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // ✅ FIX: set httpOnly cookie (Production-safe)
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    // ❌ no token in JSON anymore
    res.json({
      message: "Login successful",
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
