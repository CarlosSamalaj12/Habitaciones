const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

router.get("/whoami", authController.whoami);
router.post("/login", authController.login);

module.exports = router;
