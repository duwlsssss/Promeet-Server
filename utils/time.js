// "HH:MM" -> 분
const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// 분 -> "HH:MM"
const toTimeString = (minutes) => {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
};

/**
 * 두 시간 구간 목록의 겹치는 구간을 구한다.
 * 같은 날짜끼리 [max(시작), min(종료)]를 계산해 길이가 0보다 큰 것만 남긴다.
 * (예: 10:00~14:00 과 12:00~16:00 → 12:00~14:00)
 */
const intersectTimes = (timesA, timesB) => {
  const result = [];
  timesA.forEach((a) => {
    timesB.forEach((b) => {
      if (a.date !== b.date) return;
      const start = Math.max(toMinutes(a.startTime), toMinutes(b.startTime));
      const end = Math.min(toMinutes(a.endTime), toMinutes(b.endTime));
      if (start < end) {
        result.push({
          date: a.date,
          day: a.day,
          startTime: toTimeString(start),
          endTime: toTimeString(end),
        });
      }
    });
  });
  return result;
};

/**
 * 모든 멤버의 availableTimes에서 공통으로 가능한 시간 구간을 구한다.
 * 첫 멤버의 구간에서 시작해 나머지 멤버와 차례로 교집합을 취한다.
 */
export const getCommonTimes = (members) => {
  const validMembers = members.filter((m) => m.availableTimes?.length > 0);
  if (validMembers.length === 0) return [];

  return validMembers
    .slice(1)
    .reduce(
      (acc, m) => intersectTimes(acc, m.availableTimes),
      validMembers[0].availableTimes.map(({ date, day, startTime, endTime }) => ({
        date,
        day,
        startTime,
        endTime,
      })),
    )
    .sort((a, b) =>
      a.date === b.date
        ? toMinutes(a.startTime) - toMinutes(b.startTime)
        : a.date.localeCompare(b.date),
    );
};
