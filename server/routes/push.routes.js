const express = require("express");
const router = express.Router();
const pushController = require("../controllers/push.controller");
const { requireAuthIfEnabled } = require("../middlewares/auth.middleware");

router.get("/push/vapid-key", pushController.getVapidKey);
router.post("/push/subscribe", requireAuthIfEnabled, pushController.subscribe);
router.post("/push/unsubscribe", requireAuthIfEnabled, pushController.unsubscribe);

module.exports = router;
