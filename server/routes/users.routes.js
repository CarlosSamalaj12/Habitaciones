const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");
const { requireAuthIfEnabled } = require("../middlewares/auth.middleware");

router.post("/users/create", requireAuthIfEnabled, usersController.createUser);
router.get("/users", usersController.getUsers);
router.get("/amas-llaves", requireAuthIfEnabled, usersController.getAmasLlaves);
router.post("/users/update", requireAuthIfEnabled, usersController.updateUser);
router.post("/users/delete", requireAuthIfEnabled, usersController.deleteUser);

module.exports = router;
