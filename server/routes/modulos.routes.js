const express = require("express");
const router = express.Router();
const modulosController = require("../controllers/modulos.controller");
const { requireAuthIfEnabled } = require("../middlewares/auth.middleware");

router.get("/modules", requireAuthIfEnabled, modulosController.getModules);
router.post("/modulos/create", requireAuthIfEnabled, modulosController.createModulo);
router.post("/modulos/update", requireAuthIfEnabled, modulosController.updateModulo);
router.post("/modulos/delete", requireAuthIfEnabled, modulosController.deleteModulo);

module.exports = router;
