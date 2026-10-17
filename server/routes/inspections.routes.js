const express = require("express");
const router = express.Router();
const inspectionsController = require("../controllers/inspections.controller");
const { requireAuthIfEnabled } = require("../middlewares/auth.middleware");

router.post("/inspecciones/guardar", inspectionsController.guardarInspeccion);
router.get("/inspecciones", inspectionsController.getInspecciones);
router.post("/inspecciones/buscar", requireAuthIfEnabled, inspectionsController.buscarInspecciones);
router.post("/inspecciones/actualizar", requireAuthIfEnabled, inspectionsController.actualizarInspeccion);
router.post("/inspecciones/detalle/actualizar", requireAuthIfEnabled, inspectionsController.actualizarDetalle);
router.post("/inspecciones/eliminar", requireAuthIfEnabled, inspectionsController.eliminarInspeccion);
router.get("/inspecciones/:id", inspectionsController.getInspeccionById);

module.exports = router;
