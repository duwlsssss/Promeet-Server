import express from "express";
import { ObjectId } from "mongodb";

import {
  promisesCollection,
  likesCollection,
  userCollection,
} from "../config/db.js";
import {
  stationInfoMap,
  evaluateCandidates,
} from "../services/metroService.js";
import { sendError } from "../utils/error.js";
import { getCommonTimes } from "../utils/time.js";

const router = express.Router();

const TRANSFER_PENALTY_MINUTES = 5; // 환승에 소요되는 평균 시간

// ==========================================
// 2. 약속(Promises) 관련 라우트
// ==========================================

// 약속 상세 조회 (GET /promises/:promiseId)
router.get("/:promiseId", async (req, res) => {
  const { promiseId } = req.params;
  const { userId } = req.query;

  if (!promiseId || !userId)
    return sendError(res, "MISSING_REQUIRED_PARAM", "필수 파라미터 누락", 400);

  try {
    const promise = await promisesCollection.findOne({
      _id: new ObjectId(promiseId),
    });
    if (!promise)
      return sendError(res, "PROMISE_NOT_FOUND", "존재하지 않는 약속", 404);

    const memberIds = promise.memberIds ?? [];
    const membersRaw = await userCollection
      .find({ _id: { $in: memberIds.map((id) => new ObjectId(id)) } })
      .toArray();

    // 1. 좋아요 집계
    // $group은 결과 순서를 보장하지 않으므로, 장소별 첫 좋아요 시각(_id의 생성 시각) 순으로 정렬
    // → 좋아요를 눌러도 기존 장소의 순서가 바뀌지 않음 (프론트 낙관적 업데이트와 동일하게 새 장소는 뒤에)
    const likedPlacesRaw = await likesCollection
      .aggregate([
        { $match: { promiseId } },
        { $sort: { _id: 1 } },
        {
          $group: {
            _id: "$placeId",
            userIds: { $push: "$userId" },
            place: { $first: "$place" },
            firstLikedAt: { $min: "$_id" },
          },
        },
        { $sort: { firstLikedAt: 1 } },
        { $project: { firstLikedAt: 0 } },
      ])
      .toArray();
    // 순서 유지를 위해 $addToSet 대신 $push를 썼으므로, 동시 요청으로 생긴 중복 좋아요는 여기서 제거
    likedPlacesRaw.forEach((lp) => {
      lp.userIds = [...new Set(lp.userIds)];
    });

    const likedUserIds = new Set();
    likedPlacesRaw.forEach((lp) =>
      lp.userIds.forEach((uid) => likedUserIds.add(uid)),
    );

    // 2. 멤버 정보 매핑
    // 참여자의 nearestStation/availableTimes는 user doc이 아닌 promise.participants에 저장됨
    const participantsMap = new Map(
      (promise.participants ?? []).map((p) => [p.userId, p])
    );

    const members = membersRaw.map((m) => {
      const mId = m._id.toString();
      const isCreator = mId === promise.creatorId;
      const hasLikedPlace = isCreator ? true : likedUserIds.has(mId);

      const participantData = participantsMap.get(mId);
      const nearestStation = isCreator ? m.nearestStation : participantData?.nearestStation;
      const availableTimes = isCreator ? m.availableTimes : participantData?.availableTimes;

      return {
        name: m.name,
        userId: mId,
        hasSubmittedData: !!(nearestStation && availableTimes),
        nearestStation,
        availableTimes,
        hasLikedPlace,
      };
    });

    // 3. 상태 체크
    const isAllMembersSubmit =
      members.length === promise.memberCnt &&
      members.every((m) => m.hasSubmittedData);
    const allMembersLiked = members.every((m) => m.hasLikedPlace);

    // 모든 멤버의 availableTimes 교집합
    let fixedTime = promise.fixedTime ?? null;
    if (!fixedTime && isAllMembersSubmit) {
      fixedTime = getCommonTimes(members);
    }

    let routes = [];
    let centerStation = null;

    // 4. 중간 지점 계산 로직
    if (isAllMembersSubmit) {
      const startIds = members
        .map((m) => {
          return typeof m.nearestStation === "object"
            ? m.nearestStation.id
            : m.nearestStation;
        })
        .filter(Boolean);

      if (startIds.length > 0) {
        try {
          // 다익스트라 실행
          const evalRes = evaluateCandidates(startIds);
          const targetId = evalRes.byTotal.station;
          const targetInfo = stationInfoMap.get(targetId);

          centerStation = {
            id: targetId,
            name: targetInfo?.name || targetId.split("_")[0],
            position: targetInfo?.position ?? {
              Ma: process.env.DEFAULT_LAT,
              La: process.env.DEFAULT_LNG,
            },
          };

          routes = members
            .map((member) => {
              const userResult = evalRes.results.find(
                (r) => r.start === member.nearestStation.id,
              );
              if (!userResult) return null;

              const pathIds = userResult.getPath(targetId);
              return {
                name: member.name,
                userId: member.userId,
                route: pathIds.map((id, index) => {
                  const info = stationInfoMap.get(id);
                  const [currentName, currentLine] = id.split("_");

                  let duration = 0;
                  let isTransfer = false;

                  if (index > 0) {
                    const prevStationId = pathIds[index - 1];
                    const prevStationInfo = stationInfoMap.get(prevStationId);
                    const [prevName, prevLine] = prevStationId.split("_");

                    // 기본적인 인접 역 이동 시간 가져오기
                    const travelTime =
                      prevStationInfo?.neighborTimes?.[id] ?? 5; // 데이터가 없으면 기본값 5분
                    duration = travelTime;

                    // 환승 로직: 이름은 같은데 노선이 달라지는 경우 (예: 신도림_1 -> 신도림_2)
                    // 또는 이전 역의 노선과 현재 역의 노선이 다른 모든 경우
                    if (prevLine !== currentLine) {
                      duration += TRANSFER_PENALTY_MINUTES;
                      isTransfer = true;
                      console.log(
                        `[환승 발생] ${prevName}(${prevLine}) -> ${currentName}(${currentLine}): +${TRANSFER_PENALTY_MINUTES}분`,
                      );
                    }
                  }

                  return {
                    station: {
                      order: index + 1,
                      name: info?.name ?? currentName,
                      line: info?.line ?? currentLine,
                      position: info?.position ?? { Ma: 0, La: 0 },
                      isTransfer: isTransfer,
                    },
                    duration: duration,
                  };
                }),
              };
            })
            .filter(Boolean);
        } catch (calcError) {
          console.error("경로 계산 중 오류:", calcError);
          // 계산 오류 시 빈 값으로 진행
        }
      }
    }

    // 5. 최종 응답
    res.status(200).json({
      success: true,
      data: {
        promiseId: promise._id,
        title: promise.title,
        description: promise.description,
        creatorId: promise.creatorId,
        members,
        memberCnt: promise.memberCnt,
        isAllMembersSubmit,
        centerStation,
        routes,
        likedPlaces: likedPlacesRaw.map((lp) => ({
          userIds: lp.userIds,
          place: lp.place,
          likesCount: lp.userIds.length,
        })),
        canFix:
          userId === promise.creatorId &&
          isAllMembersSubmit &&
          allMembersLiked &&
          fixedTime?.length > 0 && // 겹치는 시간이 없으면 확정 불가
          !promise.isFixed,
        isFixed: !!promise.isFixed,
        fixedPlace: promise.fixedPlace || null,
        fixedTime,
      },
    });
  } catch (e) {
    console.error("[약속 정보 조회 오류]", e);
    sendError(res, "SERVER_ERROR", "서버 내부 오류", 500);
  }
});

// 약속 요약 정보 조회
router.get("/:promiseId/summary", async (req, res) => {
  const { promiseId } = req.params;
  if (!promiseId)
    return sendError(
      res,
      "MISSING_REQUIRED_PARAM",
      "필수 URL 경로 파라미터 누락",
      404,
    );
  try {
    const promise = await promisesCollection.findOne({
      _id: new ObjectId(promiseId),
    });
    if (!promise)
      return sendError(res, "PROMISE_NOT_FOUND", "존재하지 않는 약속", 404);
    const creator = await userCollection.findOne({
      _id: new ObjectId(promise.creatorId),
    });
    if (!creator)
      return sendError(res, "USER_NOT_FOUND", "생성자 정보 없음", 404);

    res.status(200).json({
      success: true,
      data: {
        creatorId: creator._id.toString(),
        creatorName: creator.name,
        title: promise.title,
        description: promise.description,
      },
    });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 약속 생성
router.post("/", async (req, res) => {
  const {
    creatorId,
    promiseName,
    promiseDescription,
    memberCnt,
    nearestStation,
    availableTimes,
  } = req.body;
  if (
    !creatorId ||
    !promiseName ||
    !promiseDescription ||
    !memberCnt ||
    !nearestStation ||
    !availableTimes
  )
    return sendError(res, "MISSING_REQUIRED_FIELD", "필수 필드 누락");
  if (
    !Array.isArray(availableTimes) ||
    availableTimes.some(
      (s) => !s.date || !s.day || !s.startTime || !s.endTime,
    )
  )
    return sendError(res, "INVALID_FORMAT", "약속 정보 형식이 잘못됨", 422);
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(creatorId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    const promiseDoc = {
      creatorId,
      title: promiseName,
      description: promiseDescription,
      memberCnt,
      memberIds: [creatorId],
      nearestStation,
      availableTimes,
      createdAt: new Date(),
    };
    const result = await promisesCollection.insertOne(promiseDoc);
    await userCollection.updateOne(
      { _id: new ObjectId(creatorId) },
      {
        $addToSet: { "promise.create": result.insertedId.toString() },
        $set: {
          nearestStation,
          availableTimes,
          hasSubmitted: true,
        },
      },
    );
    res.status(201).json({
      success: true,
      data: { promiseId: result.insertedId.toString() },
    });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 약속 참여
router.patch("/:promiseId/join/:userId", async (req, res) => {
  const { promiseId, userId } = req.params;
  const { nearestStation, availableTimes } = req.body;
  if (!promiseId || !userId || !nearestStation?.id || !nearestStation?.name)
    return sendError(res, "MISSING_REQUIRED_FIELD", "필수 필드 누락");
  if (
    !Array.isArray(availableTimes) ||
    availableTimes.some(
      (s) => !s.date || !s.day || !s.startTime || !s.endTime,
    )
  )
    return sendError(res, "INVALID_FORMAT", "약속 정보 형식이 잘못됨", 422);
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    const promise = await promisesCollection.findOne({
      _id: new ObjectId(promiseId),
    });
    if (!promise)
      return sendError(res, "PROMISE_NOT_FOUND", "존재하지 않는 약속", 404);
    if (!promise.memberIds.includes(userId)) {
      await promisesCollection.updateOne(
        { _id: new ObjectId(promiseId) },
        {
          // participants라는 배열 안에 유저별 정보를 객체로 push
          $push: {
            participants: {
              userId: userId,
              nearestStation,
              availableTimes,
            },
          },
          // 중복 참여 방지를 위해 memberIds에도 추가
          $addToSet: { memberIds: userId },
        },
      );
    }
    res.status(200).json({
      success: true,
      message: "약속 참여가 완료되었습니다.",
      data: {
        joinedPromise: promiseId,
        participant: userId,
      },
    });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 약속 확정
router.patch("/:promiseId/finalize", async (req, res) => {
  const { promiseId } = req.params;
  const { userId, place } = req.body;
  if (!promiseId || !userId || !place)
    return sendError(res, "MISSING_REQUIRED_FIELD", "필수 필드 누락");
  try {
    const promise = await promisesCollection.findOne({
      _id: new ObjectId(promiseId),
    });
    if (!promise)
      return sendError(res, "PROMISE_NOT_FOUND", "존재하지 않는 약속", 404);
    const membersRaw = await userCollection
      .find({
        _id: { $in: promise.memberIds.map((id) => new ObjectId(id)) },
      })
      .toArray();
    const participantsMap = new Map(
      (promise.participants ?? []).map((p) => [p.userId, p])
    );
    const members = membersRaw.map((m) => {
      const mId = m._id.toString();
      const isCreator = mId === promise.creatorId;
      const participantData = participantsMap.get(mId);
      const nearestStation = isCreator ? m.nearestStation : participantData?.nearestStation;
      const availableTimes = isCreator ? m.availableTimes : participantData?.availableTimes;
      return { ...m, nearestStation, availableTimes };
    });
    const isAllMembersSubmit =
      members.length === promise.memberCnt &&
      members.every((m) => m.nearestStation && m.availableTimes);
    const likedPlacesRaw = await likesCollection
      .aggregate([
        { $match: { promiseId } },
        { $group: { _id: "$placeId", userIds: { $addToSet: "$userId" } } },
      ])
      .toArray();
    const likedUserIds = new Set();
    likedPlacesRaw.forEach((lp) =>
      lp.userIds.forEach((uid) => likedUserIds.add(uid)),
    );
    const canFix =
      userId === promise.creatorId &&
      isAllMembersSubmit &&
      members
        .filter((m) => m._id.toString() !== promise.creatorId)
        .every((m) => Array.from(likedUserIds).includes(m._id.toString()));
    if (!canFix)
      return sendError(
        res,
        "CANNOT_FIX_PROMISE",
        "약속을 확정할 수 있는 조건이 충족되지 않았거나 권한이 없음",
        403,
      );

    const fixedTime = getCommonTimes(members);
    if (fixedTime.length === 0)
      return sendError(
        res,
        "NO_COMMON_TIME",
        "모든 멤버가 가능한 공통 시간이 없음",
        400,
      );

    await promisesCollection.updateOne(
      { _id: new ObjectId(promiseId) },
      { $set: { fixedPlace: place, fixedTime, isFixed: true, canFix: false } },
    );
    res.status(200).json({ success: true });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 좋아요 정보 조회
router.get("/likes", async (req, res) => {
  const { promiseId, placeId, userId } = req.query;
  if (!promiseId || !placeId || !userId)
    return sendError(
      res,
      "MISSING_REQUIRED_PARAM",
      "필수 쿼리 파라미터 누락",
      404,
    );
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    const isLiked = !!(await likesCollection.findOne({
      promiseId,
      placeId,
      userId,
    }));
    const likesCount = await likesCollection.countDocuments({
      promiseId,
      placeId,
    });
    res.status(200).json({ success: true, data: { isLiked, likesCount } });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// ==========================================
// 2. 약속(Promises) 관련 라우트
// ==========================================

// 좋아요 등록
router.post("/likes", async (req, res) => {
  const { promiseId, place, userId } = req.body;
  if (!promiseId || !place || !userId)
    return sendError(res, "MISSING_REQUIRED_FIELD", "userId와 place는 필수");
  if (
    !place.placeId ||
    !place.type ||
    !place.name ||
    !place.position ||
    !place.address
  )
    return sendError(res, "INVALID_FORMAT", "place의 형식이 잘못됨", 422);
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    const already = await likesCollection.findOne({
      promiseId,
      placeId: place.placeId,
      userId,
    });
    if (already)
      return sendError(res, "ALREADY_LIKED", "이미 좋아요한 장소", 409);
    await likesCollection.insertOne({
      promiseId,
      placeId: place.placeId,
      userId,
      place,
      createdAt: new Date(),
    });
    res.status(200).json({ success: true });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

// 좋아요 삭제
router.delete("/likes", async (req, res) => {
  const { promiseId, placeId, userId } = req.body;
  if (!userId || !placeId)
    return sendError(res, "MISSING_REQUIRED_FIELD", "userId와 placeId는 필수");
  try {
    const user = await userCollection.findOne({
      _id: new ObjectId(userId),
    });
    if (!user)
      return sendError(res, "USER_NOT_FOUND", "존재하지 않는 사용자", 404);
    const like = await likesCollection.findOne({ promiseId, placeId, userId });
    if (!like) return sendError(res, "NOT_LIKED", "좋아요 되지 않은 장소", 404);
    await likesCollection.deleteOne({ _id: like._id });
    res.status(200).json({ success: true });
  } catch {
    sendError(res, "SERVER_ERROR", "서버에 문제 발생", 500);
  }
});

export default router;
