const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.routes");
const systemRoutes = require("./system.routes");
const pushRoutes = require("./push.routes");
const usersRoutes = require("./users.routes");
const modulosRoutes = require("./modulos.routes");
const camarerasRoutes = require("./camareras.routes");
const checklistRoutes = require("./checklist.routes");
const inspectionsRoutes = require("./inspections.routes");
const reportsRoutes = require("./reports.routes");
const roomsRoutes = require("./rooms.routes");

router.use(authRoutes);
router.use(systemRoutes);
router.use(pushRoutes);
router.use(usersRoutes);
router.use(modulosRoutes);
router.use(camarerasRoutes);
router.use(checklistRoutes);
router.use(inspectionsRoutes);
router.use(reportsRoutes);
router.use(roomsRoutes);

module.exports = router;
