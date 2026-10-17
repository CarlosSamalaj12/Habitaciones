const { getAppVersion } = require("../config/version");
const { PORT } = require("../config/env");

function getVersion(req, res) {
  const { version, buildTime } = getAppVersion();
  res.json({ ok: true, version, buildTime });
}

function getHealth(req, res) {
  res.json({ ok: true, service: "hk-sync", port: PORT });
}

function getTime(req, res) {
  res.json({ ok: true, serverMs: Date.now(), serverIso: new Date().toISOString() });
}

module.exports = {
  getVersion,
  getHealth,
  getTime
};
