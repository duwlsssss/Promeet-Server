import { MongoClient } from "mongodb";
import { transformData } from "./transformData.js";
import "dotenv/config";

const client = new MongoClient(process.env.MONGO_URL);

async function run() {
  try {
    await client.connect();
    const db = client.db("account");
    const stationCollection = db.collection("stationTable");
    console.log("MongoDB에 연결됨");

    const finalData = await transformData();

    if (finalData && finalData.length > 0) {
      // 기존 데이터 초기화
      const deleteResult = await stationCollection.deleteMany({});
      console.log(`기존 데이터 ${deleteResult.deletedCount}개 삭제 완료.`);

      // 데이터 삽입
      const insertResult = await stationCollection.insertMany(finalData);
      console.log(
        `${insertResult.insertedCount}개의 역 데이터를 성공적으로 저장했습니다!`,
      );
      // 인덱스 생성
      await stationCollection.createIndex(
        { name: 1, line: 1 },
        { unique: true },
      );
      console.log("name, line 복합 인덱스 생성 완료");
    } else {
      console.warn("저장할 데이터가 없습니다. 스크립트를 확인해 주세요.");
    }
  } catch (err) {
    console.error("작업 중 에러 발생:", err);
  } finally {
    // 5. 연결 종료
    await client.close();
    console.log("MongoDB 연결 종료.");
  }
}

run();
