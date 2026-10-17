const { getIO } = require("../config/socket");

function emitRoomUpdate(updatedRoom) {
  try {
    const io = getIO();
    if (io && updatedRoom) {
      io.emit("room_update", updatedRoom);
    }
  } catch (err) {
    console.warn("⚠️ Error emitiendo room_update por socket:", err.message);
  }
}

module.exports = {
  emitRoomUpdate
};
