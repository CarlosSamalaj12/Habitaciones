const express = require("express");
const router = express.Router();
const roomsController = require("../controllers/rooms.controller");
const { requireAuthIfEnabled } = require("../middlewares/auth.middleware");

// Habitaciones CRUD
router.post("/habitaciones/create", requireAuthIfEnabled, roomsController.createHabitacion);
router.post("/habitaciones/update", requireAuthIfEnabled, roomsController.updateHabitacion);
router.post("/habitaciones/delete", requireAuthIfEnabled, roomsController.deleteHabitacion);

// Precios Especiales
router.post("/habitaciones/precio-especial", requireAuthIfEnabled, roomsController.updatePrecioEspecial);
router.get("/precios-especiales-habitacion", requireAuthIfEnabled, roomsController.getPreciosEspeciales);
router.post("/precios-especiales-habitacion/update", requireAuthIfEnabled, roomsController.updatePreciosEspeciales);

// Rooms
router.get("/rooms", requireAuthIfEnabled, roomsController.getRooms);
router.post("/room/update", requireAuthIfEnabled, roomsController.updateRoom);

module.exports = router;
