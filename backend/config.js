const { Sequelize } = require("sequelize");

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "1245";
const DB_PORT = process.env.DB_PORT || 3306;
const DB_NAME = process.env.DATABASE || "dns_db";

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  dialect: "mysql",
  logging: false,
  port: DB_PORT,
});

module.exports = sequelize;
