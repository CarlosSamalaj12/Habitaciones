const { Client } = require("ssh2");
const { exec } = require("child_process");

console.log("=== COMMITTING AND PUSHING LOCALLY ===");
exec('git add . && git commit -m "Actualizar version 1.3.34 y frontend para quitar mantenimiento" && git push', (err, stdout, stderr) => {
  if (err) {
    console.error("Git error:", err);
    return;
  }
  console.log("Git stdout:", stdout);
  console.log("Git stderr:", stderr);

  console.log("=== CONNECTING TO VPS ===");
  const conn = new Client();
  conn.on("ready", () => {
    console.log("SSH Ready!");
    conn.exec('cd /var/www/Habitaciones && git pull && bash -c ". ~/.nvm/nvm.sh && pm2 restart sistema-hab"', (err, stream) => {
      if (err) throw err;
      let output = "";
      stream.on("close", (code) => {
        console.log("SSH finished exit code:", code);
        console.log("=== OUTPUT ===");
        console.log(output);
        conn.end();
      }).on("data", data => output += data.toString()).stderr.on("data", data => output += "[STDERR] " + data.toString());
    });
  }).connect({
    host: "2.25.166.211",
    port: 22,
    username: "root",
    password: "&Za&6uaK#OdYri",
    readyTimeout: 10000
  });
});
