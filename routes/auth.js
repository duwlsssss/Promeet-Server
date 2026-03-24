import express from "express";
import { ObjectId } from "mongodb";

import { userCollection } from "../config/db.js";
import { sendError } from "../utils/error.js";

const router = express.Router();

// 로그아웃
router.post("/auth/logout", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return sendError(res, "MISSING_REQUIRED_FIELD", "userId는 필수");
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    res.status(200).json({ success: true });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 회원가입
router.post("/auth/signup", async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password)
    return sendError(res, "MISSING_REQUIRED_FIELD", "이름과 비밀번호는 필수");
  try {
    const exists = await userCollection.findOne({ name });
    if (exists)
      return sendError(res, "USER_EXISTS", "이미 존재하는 사용자", 409);
    const result = await userCollection.insertOne({
      name,
      password,
      promise: { create: [], join: [] },
      fixedSchedules: [],
    });
    res.status(201).json({
      success: true,
      data: { userId: result.insertedId.toString(), name },
    });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

export default router;
