const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("./config");

//User Model
const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  merchant_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    validate: { isEmail: true },
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  is_admin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

const DNSRecord = sequelize.define("DNSRecord", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  domain: { type: DataTypes.STRING, allowNull: false },
  type: {
    type: DataTypes.ENUM("A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"),
    allowNull: false,
  },
  name: { type: DataTypes.STRING, allowNull: false },
  value: { type: DataTypes.STRING, allowNull: false },
  ttl: { type: DataTypes.INTEGER, defaultValue: 3600 },
  priority: { type: DataTypes.INTEGER, allowNull: true },
  comment: { type: DataTypes.STRING, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  userId: { type: DataTypes.INTEGER, allowNull: false }
});

DNSRecord.belongsTo(User, { foreignKey: "userId" });
User.hasMany(DNSRecord, { foreignKey: "userId" });

module.exports = { User, DNSRecord };
