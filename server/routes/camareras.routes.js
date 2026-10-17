const express = require("express");
const router = express.Router();
const camarerasController = require("../controllers/camareras.controller");
const { requireAuthIfEnabled } = require("../middlewares/auth.middleware");

// Camareras
router.get("/camareras", camarerasController.getCamareras);
router.post("/camareras/create", requireAuthIfEnabled, camarerasController.createCamarera);
router.post("/camareras/update", requireAuthIfEnabled, camarerasController.updateCamarera);
router.post("/camareras/delete", requireAuthIfEnabled, camarerasController.deleteCamarera);

// Configuracion de Pagos
router.get("/config-pagos", camarerasController.getConfigPagos);
router.post("/config-pagos/update", requireAuthIfEnabled, camarerasController.updateConfigPagos);

module.exports = router;
