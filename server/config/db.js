import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const mongoURL = process.env.DATABASE;
const dbName = process.env.DB_NAME;
let dbClient = null;
const collectionNameRef = {};

export const connectDB = async () => {
  const collectionsName = [
    "employees",
    "departments",
    "admins",
    "managers",
    "hr",
    "appointment",
    "notification",
  ];
  try {
    if (dbClient) {
      console.log("Database is already connected.");
      return;
    }

    const client = await MongoClient.connect(mongoURL, { minPoolSize: 10 });
    dbClient = client.db(dbName);

    const collections = await dbClient.listCollections().toArray();
    const existingCollectionsName =
      (collections &&
        collections.length > 0 &&
        collections.map((eachCollection) => eachCollection.name)) ||
      [];
    for (const collection of collectionsName) {
      if (!existingCollectionsName.includes(collection)) {
        await dbClient.createCollection(collection);
        await dbClient.collection(collection).createIndex({ userId: 1 });
      }
      collectionNameRef[collection] = dbClient.collection(collection);
    }
  } catch (err) {
    console.error("Error during database connection initialization:", err);
  }
};

export const getCollectionRef = (collectionName) => {
  return collectionNameRef[collectionName];
};
