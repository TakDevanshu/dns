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
  type: DataTypes.ENUM('A','AAAA','CNAME','MX','TXT','NS','SRV','SOA','PTR','CAA'),
  allowNull: false
},
  name: { type: DataTypes.STRING, allowNull: false },
  value: { type: DataTypes.STRING, allowNull: false },
  ttl: { type: DataTypes.INTEGER, defaultValue: 3600 },
  priority: { type: DataTypes.INTEGER, allowNull: true },
  comment: { type: DataTypes.STRING, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
});

const Zone = sequelize.define("Zone", {
  domain: { type: DataTypes.STRING, unique: true, allowNull: false },
  status: {
    type: DataTypes.ENUM("pending", "active", "suspended"),
    defaultValue: "pending",
  },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  nameServers: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: () => [
      "ns1.yourdns.com",
      "ns2.yourdns.com",
      "ns3.yourdns.com",
    ],
  },
});

const AuditLog = sequelize.define("AuditLog", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  action: { type: DataTypes.STRING, allowNull: false }, // e.g. 'CREATE', 'UPDATE', 'DELETE'
  entityType: { type: DataTypes.STRING, allowNull: false }, // e.g. 'DNSRecord', 'Zone', 'NameServer'
  entityId: { type: DataTypes.INTEGER, allowNull: true }, // ID of the affected entity
  domain: { type: DataTypes.STRING, allowNull: true },
  details: { type: DataTypes.JSON, allowNull: true }, // Store what changed
  timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

const DomainMember = sequelize.define("DomainMember", {
  domain: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  role: {
    type: DataTypes.ENUM("admin", "editor", "viewer"),
    allowNull: false,
    defaultValue: "viewer",
  },
  invitedBy: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM("active", "pending"),
    defaultValue: "pending",
  },
});

DNSRecord.belongsTo(User, { foreignKey: "userId" });
User.hasMany(DNSRecord, { foreignKey: "userId" });

User.hasMany(Zone, { foreignKey: "userId" });
Zone.belongsTo(User, { foreignKey: "userId" });

Zone.hasMany(DNSRecord, { foreignKey: "zoneId" });
DNSRecord.belongsTo(Zone, { foreignKey: "zoneId" });

DomainMember.belongsTo(User, { foreignKey: "userId" });
DomainMember.belongsTo(User, { as: "Inviter", foreignKey: "invitedBy" });

module.exports = { User, DNSRecord, Zone, AuditLog, DomainMember };
