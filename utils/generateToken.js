import jwt from "jsonwebtoken";

// =====================================================
// GENERATE JWT TOKEN
// =====================================================

export const generateToken = (userId) => {
  return jwt.sign(
    {
      userId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};

// =====================================================
// SET AUTH COOKIE
// =====================================================

export const setAuthCookie = (res, token) => {
  const isProduction =
    process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,

    secure: isProduction,

    sameSite: isProduction
      ? "none"
      : "lax",

    maxAge: 7 * 24 * 60 * 60 * 1000,

    path: "/",
  });
};