// src/utils/password.js
import bcrypt from 'bcrypt';

export const hashPassword = (password) =>
  bcrypt.hash(password, 12);

export const verifyPassword = (password, hash) =>
  bcrypt.compare(password, hash);
