const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  try {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'Xvfv2du1p5xyZX',
      database: process.env.DB_NAME || 'bdinscamareria',
      port: Number(process.env.DB_PORT || 3306),
      timezone: '-06:00'
    });

    // Check engines
    const [tables] = await c.query(
      "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('habitaciones','tipos_limpieza')",
      [process.env.DB_NAME || 'bdinscamareria']
    );
    console.log('Table engines:', JSON.stringify(tables, null, 2));

    // Check if our table exists
    const [exists] = await c.query("SHOW TABLES LIKE 'precios_especiales_habitacion'");
    console.log('precios_especiales_habitacion exists:', exists.length > 0);

    // Try creating the table
    console.log('Attempting to create table...');
    await c.query(`
      CREATE TABLE IF NOT EXISTS precios_especiales_habitacion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        habitacion_id INT NOT NULL,
        tipo_limpieza_id INT NOT NULL,
        precio DECIMAL(10,2) DEFAULT NULL,
        UNIQUE KEY uq_hab_tipo (habitacion_id, tipo_limpieza_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('Table created successfully (without FK constraints)');

    await c.end();
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
