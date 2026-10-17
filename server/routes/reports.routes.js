const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reports.controller");
const { requireAuthIfEnabled } = require("../middlewares/auth.middleware");

router.get("/reportes/pagos", requireAuthIfEnabled, reportsController.getReportePagos);
router.get("/reportes/rendimiento", requireAuthIfEnabled, reportsController.getReporteRendimiento);
router.get("/reportes/rendimiento/amas", requireAuthIfEnabled, reportsController.getReporteRendimientoAmas);
router.get("/reportes/rendimiento/daily", requireAuthIfEnabled, reportsController.getReporteRendimientoDaily);
router.get("/reportes/rendimiento/detalle-dias", requireAuthIfEnabled, reportsController.getReporteDetalleDias);
router.get("/reportes/historial", requireAuthIfEnabled, reportsController.getReporteHistorial);

module.exports = router;
