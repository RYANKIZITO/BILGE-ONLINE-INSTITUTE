// src/utils/jwt.js
import jwt from 'jsonwebtoken';

export const signToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

export const verifyToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);
