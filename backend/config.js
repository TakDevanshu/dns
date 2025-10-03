const { Sequelize } = require("sequelize");

const sequelize = new Sequelize("merchant", "root", "1245", {
  host: "127.0.0.1",
  dialect: "mysql",
  // logging: console.log,
  logging: false,
  port: 3306,
});

module.exports = sequelize;
