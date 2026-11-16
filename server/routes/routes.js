import express from "express";
import { nots } from "../controller/noti.js";

const router = express.Router();
router.route("/hell").post(nots);

export default router;
