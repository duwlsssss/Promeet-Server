import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.MONGO_URL;
const client = new MongoClient(url);

export let db, userCollection, likesCollection, promisesCollection;

export async function connectDB() {
  await client.connect();
  const database = client.db("account");
  db = database;
  userCollection = database.collection("userTable");
  likesCollection = database.collection("likeTable");
  promisesCollection = database.collection("promiseTable");
  console.log("MongoDB에 연결됨");
  return { db, userCollection, likesCollection, promisesCollection };
}
