const express = require("express");
const router = express.Router();
const systemController = require("../controllers/system.controller");

router.get("/version", systemController.getVersion);
router.get("/health", systemController.getHealth);
router.get("/time", systemController.getTime);

module.exports = router;
