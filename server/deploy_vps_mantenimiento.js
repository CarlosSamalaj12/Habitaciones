const { Client } = require("ssh2");
const { exec } = require("child_process");

console.log("=== RUNNING GIT PUSH LOCALLY ===");
exec('git add . && git commit -m "Permitir a camareras y ama de llaves quitar mantenimiento directamente desde la tarjeta de habitacion" && git push', (err, stdout, stderr) => {
  if (err) {
    console.error("Git commit/push failed:", err);
    return;
  }
  console.log("Git push stdout:", stdout);
  console.log("Git push stderr:", stderr);

  console.log("=== CONNECTING TO VPS VIA SSH ===");
  const conn = new Client();
  conn.on("ready", () => {
    console.log("SSH Connection Ready!");
    
    const command = `
      echo '=== GOING TO PROJECT DIR ==='
      cd /var/www/Habitaciones
      
      echo '=== RUNNING GIT PULL ==='
      git pull
      
      echo '=== RESTARTING NODE APP VIA PM2 WITH NVM ==='
      bash -c ". ~/.nvm/nvm.sh && pm2 restart sistema-hab"
    `;

    conn.exec(command, (err, stream) => {
      if (err) throw err;
      let output = "";
      stream.on("close", (code, signal) => {
        console.log("Command finished with exit code:", code);
        console.log("=== OUTPUT ===");
        console.log(output);
        conn.end();
      }).on("data", (data) => {
        output += data.toString();
      }).stderr.on("data", (data) => {
        output += "[STDERR] " + data.toString();
      });
    });
  }).connect({
    host: "2.25.166.211",
    port: 22,
    username: "root",
    password: "&Za&6uaK#OdYri",
    readyTimeout: 10000
  });
});
