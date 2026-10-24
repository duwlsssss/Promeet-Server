import axios from "axios";
import fs from "fs";
import path from "path";
import "dotenv/config";

const rawStations = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "metro/metro_graph.json"), "utf-8"),
);

// metro_graph.json의 노선 코드 → 카카오 검색용 노선명
const LINE_NAMES = {
  A: "공항철도",
  B: "수인분당선",
  E: "용인에버라인",
  G: "경춘선",
  I: "인천1호선",
  I2: "인천2호선",
  K: "경의중앙선",
  KK: "경강선",
  KP: "김포골드라인",
  S: "신분당선",
  SH: "서해선",
  U: "의정부경전철",
  W: "우이신설선",
};

async function getCoordinates(stationName, stationLine) {
  try {
    const response = await axios.get(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(stationName + "역" + stationLine)}`,
      {
        headers: { Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}` },
      },
    );

    if (response.data.documents.length > 0) {
      const { x, y } = response.data.documents[0];
      return { Ma: parseFloat(y), La: parseFloat(x) }; // Ma: 위도, La: 경도
    }
    return null;
  } catch (error) {
    console.error(`${stationName} 검색 실패:`, error.message);
    return null;
  }
}

export async function transformData() {
  const refinedData = [];

  for (const item of rawStations) {
    // // "신림_2" 또는 "서울대벤처타운_신림" 형태
    const [name, line] = item.station.split("_");

    // 카카오 검색 시에는 "신림역 2호선" 처럼 온전한 이름이 유리
    const searchLine = line.match(/^\d+$/) ? `${line}호선` : LINE_NAMES[line];
    const position = await getCoordinates(name, searchLine);

    refinedData.push({
      name: name,
      line: item.line, // "2" 또는 "신림"
      position: position,
      neighbors: item.neighbors.map((n) => ({
        ...n,
        station: n.station
      })),
    });
  }

  return refinedData;
}