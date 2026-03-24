import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { loadMetroData } from "./services/metroService.js";
import authRouter from "./routes/auth.js";
import userRouter from "./routes/user.js";
import promiseRouter from "./routes/promise.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

// 미들웨어 설정
app.use(express.json());

// cors 설정
const allowedOrigins = [
  "http://localhost:5173", // 로컬 환경
  "https://promeet-six.vercel.app", // Vercel 배포 환경
];

app.use(
  cors({
    origin: function (origin, callback) {
      // origin이 없거나(로컬 호출 등) 목록에 있으면 허용
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

// 라우터 연결
app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/promise", promiseRouter);

// 서버 시작 함수
async function start() {
  try {
    // DB 연결
    const { db } = await connectDB();
    // 지하철 데이터 로드
    await loadMetroData(db);
    // 서버 리스닝
    app.listen(PORT, () => console.log(`서버 실행 중: ${PORT}`));
  } catch (err) {
    console.error("서버 시작 실패:", err);
  }
}

start();
