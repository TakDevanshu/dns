const { Sequelize } = require("sequelize");

const sequelize = new Sequelize("dns_db", "root", "1245", {
  host: "db",
  dialect: "mysql",
  // logging: console.log,
  logging: false,
  port: 3306,
});

module.exports = sequelize;
