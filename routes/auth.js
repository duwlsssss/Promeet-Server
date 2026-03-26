import express from "express";
import { ObjectId } from "mongodb";

import { userCollection } from "../config/db.js";
import { sendError } from "../utils/error.js";

const router = express.Router();

// 로그아웃
router.post("/logout", async (req, res) => {
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
router.post("/signup", async (req, res) => {
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

// 로그인
router.post("/signin", async (req, res) => {
  const { name, password, promiseId } = req.body;

  if (!name || !password)
    return sendError(res, "MISSING_REQUIRED_FIELD", "이름과 비밀번호는 필수");

  try {
    let user = await userCollection.findOne({ name });

    // 사용자가 없으면 자동으로 회원가입 시키거나 에러를 냅니다.
    // 여기서는 기존 로직대로 '없으면 생성' 방식을 유지해볼게요.
    if (!user) {
      const result = await userCollection.insertOne({
        name,
        password,
        promise: { create: [], join: [] }, // 필드 구조 맞춰주기
        fixedSchedules: [],
      });
      user = await userCollection.findOne({ _id: result.insertedId });
    } else if (user.password !== password) {
      return sendError(
        res,
        "INVALID_PASSWORD",
        "비밀번호가 일치하지 않습니다",
        401,
      );
    }

    // promiseId가 있는 경우 참여 목록에 추가
    if (promiseId) {
      await userCollection.updateOne(
        { _id: user._id },
        { $addToSet: { "promise.join": promiseId } },
      );
    }

    res.status(200).json({
      success: true,
      data: {
        userId: user._id.toString(),
        name: user.name,
      },
    });
  } catch (error) {
    console.error(error);
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

export default router;
