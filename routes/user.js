import express from "express";
import { ObjectId } from "mongodb";

import { userCollection } from "../config/db.js";
import { sendError } from "../utils/error.js";

const router = express.Router();

// 내 정보 조회
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId)
    return sendError(
      res,
      "MISSING_REQUIRED_PARAM",
      "필수 URL 경로 파라미터 누락",
      404,
    );
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    res.status(200).json({
      success: true,
      data: {
        userId: user._id.toString(),
        name: user.name,
        fixedSchedule: user.fixedSchedules || [],
        promises: {
          create: user.promise?.create || [],
          join: user.promise?.join || [],
        },
      },
    });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 고정 스케줄 등록
router.post("/:userId/fixed-schedules", async (req, res) => {
  const { userId } = req.params;
  const { fixedSchedules } = req.body;
  if (!userId || !fixedSchedules)
    return sendError(
      res,
      "MISSING_REQUIRED_FIELD",
      "userId와 fixedSchedules는 필수",
    );
  if (
    !Array.isArray(fixedSchedules) ||
    fixedSchedules.some(
      (s) => !s.id || !s.date || !s.day || !s.startTime || !s.endTime,
    )
  )
    return sendError(
      res,
      "INVALID_FORMAT",
      "fixedSchedule의 형식이 잘못됨",
      422,
    );
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    const existing = user.fixedSchedules || [];
    for (const newSch of fixedSchedules) {
      if (
        existing.some(
          (e) =>
            e.date === newSch.date &&
            e.startTime === newSch.startTime &&
            e.endTime === newSch.endTime,
        )
      ) {
        return sendError(
          res,
          "SCHEDULE_CONFLICT",
          "이미 등록된 고정 스케줄과 중복됨",
          409,
        );
      }
    }
    await userCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $push: { fixedSchedules: { $each: fixedSchedules } } },
    );
    res.status(201).json({ success: true });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 고정 스케줄 삭제
router.delete("/:userId/fixed-schedules/:scheduleId", async (req, res) => {
  const { userId, scheduleId } = req.params;
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    const existing = user.fixedSchedules || [];
    if (!existing.some((s) => s.id === scheduleId))
      return sendError(res, "SCHEDULE_NOT_FOUND", "존재하지 않는 스케줄", 404);
    await userCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { fixedSchedules: { id: scheduleId } } },
    );
    res.status(200).json({ success: true });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 고정 스케줄 수정
router.patch("/:userId/fixed-schedules/:scheduleId", async (req, res) => {
  const { userId, scheduleId } = req.params;
  const { fixedSchedule } = req.body;
  if (!userId || !scheduleId || !fixedSchedule)
    return sendError(res, "MISSING_REQUIRED_FIELD", "필수 필드 누락");
  if (
    !fixedSchedule.id ||
    !fixedSchedule.day ||
    !fixedSchedule.startTime ||
    !fixedSchedule.endTime
  )
    return sendError(
      res,
      "INVALID_FORMAT",
      "fixedSchedule의 형식이 잘못됨",
      422,
    );
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    const existing = user.fixedSchedules || [];
    const idx = existing.findIndex((s) => s.id === scheduleId);
    if (idx === -1)
      return sendError(res, "SCHEDULE_NOT_FOUND", "존재하지 않는 스케줄", 404);
    if (
      existing.some(
        (s, i) =>
          i !== idx &&
          s.day === fixedSchedule.day &&
          s.startTime === fixedSchedule.startTime &&
          s.endTime === fixedSchedule.endTime,
      )
    ) {
      return sendError(
        res,
        "SCHEDULE_CONFLICT",
        "이미 등록된 고정 스케줄과 중복됨",
        409,
      );
    }
    await userCollection.updateOne(
      { _id: new ObjectId(userId), "fixedSchedules.id": scheduleId },
      { $set: { "fixedSchedules.$": fixedSchedule } },
    );
    res.status(200).json({ success: true });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

export default router;
