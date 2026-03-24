import { dijkstraWithPaths } from "../utils/dijkstra.js";

export let stationInfoMap = new Map();
export let metroGraph = {};

// DB에서 지하철 데이터를 로드하는 함수
export async function loadMetroData(db) {
  try {
    // DB에서 모든 역 정보 가져오기
    const stationCollection = db.collection("stationTable");
    const metroData = await stationCollection.find({}).toArray();

    // stationInfoMap 채우기
    stationInfoMap = new Map(
      metroData.map((s) => [
        `${s.name}_${s.line}`,
        {
          name: s.name,
          line: s.line,
          position: s.position,
          neighborTimes: Object.fromEntries(
            s.neighbors.map((n) => [n.station, n.time]),
          ),
        },
      ]),
    );

    // 다익스트라용 metroGraph 구성
    metroGraph = {};
    metroData.forEach(({ name, line, neighbors }) => {
      metroGraph[`${name}_${line}`] = neighbors.map((n) => ({
        node: n.station,
        weight: n.time,
      }));
    });
  } catch (err) {
    console.error("지하철 데이터 로드 실패:", err);
  }
}

export function evaluateCandidates(starts) {
  const results = starts.map((start) => {
    const { times, getPath } = dijkstraWithPaths(metroGraph, start);
    return { start, times, getPath };
  });

  const candidates = Object.keys(metroGraph).map((station) => {
    const times = results.map((r) => r.times[station] ?? Infinity);
    const total = times.reduce((a, b) => a + b, 0);
    const avg = total / times.length;
    const stddev = Math.sqrt(
      times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length,
    );
    return { station, total, avg, stddev, times };
  });

  // 총 이동시간 합이 가장 적은 역 (byTotal)
  const byTotal = [...candidates].sort((a, b) => a.total - b.total)[0];
  // 편차와 평균의 합이 가장 적은 역 (byBalance - 공평함)
  const byBalance = [...candidates].sort(
    (a, b) => a.stddev + a.avg - (b.stddev + b.avg),
  )[0];

  return { results, byTotal, byBalance };
}
