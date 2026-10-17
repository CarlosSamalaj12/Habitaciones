const express = require("express");
const router = express.Router();
const checklistController = require("../controllers/checklist.controller");
const { requireAuthIfEnabled } = require("../middlewares/auth.middleware");

// Categorías
router.get("/checklist/categorias", checklistController.getCategorias);
router.post("/checklist/categorias/create", requireAuthIfEnabled, checklistController.createCategoria);
router.post("/checklist/categorias/update", requireAuthIfEnabled, checklistController.updateCategoria);
router.post("/checklist/categorias/delete", requireAuthIfEnabled, checklistController.deleteCategoria);

// Items
router.get("/checklist/items", checklistController.getItems);
router.post("/checklist/items/create", requireAuthIfEnabled, checklistController.createItem);
router.post("/checklist/items/update", requireAuthIfEnabled, checklistController.updateItem);
router.post("/checklist/items/delete", requireAuthIfEnabled, checklistController.deleteItem);

// Tipos de Limpieza
router.get("/tipos-limpieza", checklistController.getTiposLimpieza);
router.post("/tipos-limpieza/create", requireAuthIfEnabled, checklistController.createTipoLimpieza);
router.post("/tipos-limpieza/update", requireAuthIfEnabled, checklistController.updateTipoLimpieza);
router.post("/tipos-limpieza/delete", requireAuthIfEnabled, checklistController.deleteTipoLimpieza);

module.exports = router;
