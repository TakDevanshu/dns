const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const sequelize = require("./config");
const { User, DNSRecord, Zone, AuditLog, DomainMember } = require("./models");

const app = express();
app.use(express.json());

const JWT_SECRET = "your_jwt_secret";
const PORT = process.env.PORT || 5000;

//Database Sync
async function connectWithRetry(retries = 10, delay = 5000) {
  while (retries) {
    try {
      await sequelize.authenticate();
      console.log("Database connected successfully");

      await sequelize.sync({ alter: true });
      console.log("Database synced");

      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
      return;
    } catch (err) {
      retries -= 1;
      console.error(`DB connection failed. Retries left: ${retries}`);
      console.error(err.message);

      if (!retries) {
        console.error("Out of retries. Exiting...");
        process.exit(1);
      }

      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

connectWithRetry();

// Cors setup
const allowedOrigins = ["http://localhost:5173", "http://172.232.121.87"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true, // if using cookies or auth headers
  })
);

app.use(express.json());

// Middleware for authentication of token
const verifyToken = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Expired or invalid token" });
  }
};

// --- Role-based helpers ---

// Check if user is owner or team member (any role)
async function canViewDomain(userId, domain) {
  const zone = await Zone.findOne({ where: { domain } });
  if (zone && zone.userId === userId) return true;
  const member = await DomainMember.findOne({ where: { userId, domain, status: "active" } });
  return !!member;
}

// Check if user is owner or has required team role
async function checkDomainAccess(userId, domain, requiredRole) {
  const zone = await Zone.findOne({ where: { domain } });
  if (zone && zone.userId === userId) return true;
  const member = await DomainMember.findOne({ where: { userId, domain, status: "active" } });
  if (!member) return false;
  const rolePriority = { viewer: 1, editor: 2, admin: 3 };
  return rolePriority[member.role] >= rolePriority[requiredRole];
}

// Get domain owner info
async function getDomainOwner(domain) {
  const zone = await Zone.findOne({ where: { domain } });
  if (!zone) return null;
  return await User.findByPk(zone.userId);
}

// Helper functions
const isValidIPv4 = (ip) => {
  const regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return regex.test(ip);
};

const isValidIPv6 = (ip) => {
  // Covers all standard IPv6 notations, including compressed forms
  return typeof ip === "string" && /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9]))$/.test(ip);
};

const isValidDomain = (domain) =>
  typeof domain === "string" && /^[a-zA-Z0-9.-]+$/.test(domain);

const isValidEmail = (email) =>
  typeof email === "string" && /\S+@\S+\.\S+/.test(email);

const validateTTL = (ttl) =>
  !isNaN(ttl) && ttl >= 60 && ttl <= 86400;

const validatePriority = (priority) =>
  !isNaN(priority) && priority >= 0 && priority <= 65535;

const isValidSRV = ({ priority, weight, port, target }) =>
  !isNaN(priority) && !isNaN(weight) && !isNaN(port) && isValidDomain(target);

const isValidSOA = ({ primary, admin, serial, refresh, retry, expire, minimum }) =>
  isValidDomain(primary) &&
  isValidEmail(admin) &&
  [serial, refresh, retry, expire, minimum].every(n => !isNaN(n));

const isValidCAA = ({ flags, tag, value }) =>
  !isNaN(flags) && typeof tag === "string" && tag.length > 0 && typeof value === "string" && value.length > 0;

// DNS record type validation
const validateRecordValue = (type, value, name = "") => {
  switch (type.toUpperCase()) {
    case "A":
      return isValidIPv4(value);
    case "AAAA":
      return isValidIPv6(value);
    case "CNAME":
    case "NS":
      return isValidDomain(value);
    case "MX":
      return isValidDomain(value);
    case "TXT":
      return value.length <= 255;
    case "SOA":
      const soaParts = value.split(" ");
      return (
        soaParts.length >= 7 &&
        isValidDomain(soaParts[0]) &&
        isValidEmail(soaParts[1].replace("@", "."))
      );
    case "SRV":
      const srvParts = value.split(" ");
      return (
        srvParts.length === 4 &&
        !isNaN(srvParts[0]) &&
        !isNaN(srvParts[1]) &&
        !isNaN(srvParts[2]) &&
        isValidDomain(srvParts[3])
      );
    case "PTR":
      return isValidDomain(value);
    case "CAA":
      const caaParts = value.split(" ");
      return caaParts.length >= 3;
    default:
      return true;
  }
};

//api
app.get("/", (req, res) => {
  return res.status(200).json({ message: "Welcome" });
});

app.get("/protected", verifyToken, (req, res) => {
  res.json({ message: "You are authorized!", user: req.user });
});

app.post("/signup", async (req, res) => {
  console.log("------------------SignUp Start------------------");
  const { merchant_name, email, password } = req.body;
  if (!merchant_name || !email || !password) {
    console.log("Parameters Missing");
    return res.status(400).json({ message: "Parameters Missing" });
  }

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      console.log("Already a User");
      return res.status(400).json({ message: "Already a User" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      merchant_name,
      email,
      password: hashedPassword,
    });

    console.log("User Registered Successfully");

    return res.status(200).json({
      message: "User Registered Successfully",
      id: user.id,
      name: merchant_name,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server Error", error: err.message });
  }
});

app.post("/login", async (req, res) => {
  console.log("------------------Login Start------------------");
  const { email, password } = req.body;
  if (!email || !password) {
    console.log("Email and Password required");
    return res.status(400).json({ message: "Email and Password required" });
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      console.log("Invalid Credentials");
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Invalid Password");
      return res.status(400).json({ message: "Invalid Password" });
    }

    const token = jwt.sign(
      { userID: user.id, is_admin: user.is_admin },
      JWT_SECRET,
      {
        expiresIn: "4h",
      }
    );

    console.log("Login Successful");
    return res.status(200).json({ message: "Login Successful", token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server Error", err: err.message });
  }
});

//Dns record api

// Create DNS record (editor/admin)
app.post("/domains/create", verifyToken, async (req, res) => {
  try {
    const {
      domain, type, name, value, ttl, priority, comment, userId,
      weight, port, target, primary, admin, serial, refresh, retry, expire, minimum,
      flags, tag
    } = req.body;

    const hasAccess = await checkDomainAccess(req.user.userID, domain, "editor");
    if (!req.user.is_admin && !hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to create DNS records for this domain",
      });
    }

    // Ensure Zone exists or create it with default name servers
    let zone = await Zone.findOne({ where: { domain, userId } });
    if (!zone) {
      zone = await Zone.create({
        domain,
        userId,
        status: "active",
        nameServers: ["ns1.yourdns.com", "ns2.yourdns.com", "ns3.yourdns.com"],
      });
    }

    // Validate required fields
    if (!domain || !type || !name || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: domain, type, name, userId",
      });
    }

    // Validate domain
    if (!isValidDomain(domain)) {
      return res.status(400).json({
        success: false,
        message: "Invalid domain format",
      });
    }

    // Validate DNS record type
    const validTypes = [
      "A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV", "PTR", "CAA"
    ];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid DNS record type. Supported types: ${validTypes.join(", ")}`,
      });
    }

    // Validate record value based on type
    if (["A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR"].includes(type.toUpperCase())) {
      if (!value) {
        return res.status(400).json({ success: false, message: `Value required for ${type} record` });
      }
      if (!validateRecordValue(type, value, name)) {
        return res.status(400).json({ success: false, message: `Invalid value for ${type} record` });
      }
    }
    let recordValue = value; // <-- Ensure this is set for all types

    // SRV validation
    if (type.toUpperCase() === "SRV") {
      const numPriority = Number(priority);
      const numWeight = Number(weight);
      const numPort = Number(port);
      if (
        [numPriority, numWeight, numPort].some(v => v === undefined || v === "" || isNaN(v)) ||
        !target || target === "" ||
        !isValidSRV({ priority: numPriority, weight: numWeight, port: numPort, target })
      ) {
        return res.status(400).json({ success: false, message: "SRV record requires numeric priority, weight, port, and valid target" });
      }
      recordValue = `${numPriority} ${numWeight} ${numPort} ${target}`;
    }
    // SOA validation
if (type.toUpperCase() === "SOA") {
  const numSerial = Number(serial);
  const numRefresh = Number(refresh);
  const numRetry = Number(retry);
  const numExpire = Number(expire);
  const numMinimum = Number(minimum);

  if (
    [primary, admin].some(v => v === undefined || v === "") ||
    [serial, refresh, retry, expire, minimum].some(v => v === undefined || v === "" || isNaN(Number(v))) ||
    !isValidSOA({ primary, admin, serial: numSerial, refresh: numRefresh, retry: numRetry, expire: numExpire, minimum: numMinimum })
  ) {
    return res.status(400).json({ success: false, message: "SOA record requires primary, admin, serial, refresh, retry, expire, minimum" });
  }
  recordValue = `${primary} ${admin} ${numSerial} ${numRefresh} ${numRetry} ${numExpire} ${numMinimum}`;
}
    // CAA validation
    if (type.toUpperCase() === "CAA") {
      const numFlags = Number(flags);
      if (
        [numFlags, tag, value].some(v => v === undefined || v === "" || (typeof v === "number" && isNaN(v))) ||
        !isValidCAA({ flags: numFlags, tag, value })
      ) {
        return res.status(400).json({ success: false, message: "CAA record requires numeric flags, tag, and value" });
      }
      recordValue = `${numFlags} ${tag} ${value}`;
    }
    // Validate TTL
    if (!validateTTL(ttl)) {
      return res.status(400).json({ success: false, message: "TTL must be between 60 and 86400 seconds" });
    }
    // Validate priority for MX
    if (type.toUpperCase() === "MX") {
      if (priority === undefined || !validatePriority(priority)) {
        return res.status(400).json({ success: false, message: "Valid priority (0-65535) required for MX records" });
      }
    }

    const record = await DNSRecord.create({
      domain,
      type: type.toUpperCase(),
      name,
      value: recordValue,
      ttl: parseInt(ttl),
      priority: priority ? parseInt(priority) : null,
      userId,
      comment: comment || null,
      isActive: true,
      zoneId: zone.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Audit log for create
    await AuditLog.create({
      userId: req.user.userID,
      action: "CREATE",
      entityType: "DNSRecord",
      entityId: record.id,
      domain: record.domain,
      details: record.toJSON(),
      timestamp: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "DNS record created successfully",
      data: record,
    });
  } catch (err) {
    console.error("Error creating DNS record:", err); // <-- Add this for debugging
    return res
      .status(500)
      .json({ success: false, message: "Failed to create DNS record" });
  }
});

// Get all unique domains for a user (owned or shared, with owner info)
app.get("/domains/user/:userId", verifyToken, async (req, res) => {
  try {
    if (parseInt(req.params.userId) !== req.user.userID && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Domains owned by user
    const ownedDomains = await DNSRecord.findAll({
      where: { userId: req.params.userId },
      attributes: [
        [DNSRecord.sequelize.fn("DISTINCT", DNSRecord.sequelize.col("domain")), "domain"]
      ]
    });

    // Domains shared with user (team access)
    const memberDomains = await DomainMember.findAll({
      where: { userId: req.params.userId, status: "active" },
      attributes: ["domain"]
    });

    // Merge and deduplicate
    const domainSet = new Set([
      ...ownedDomains.map(d => d.domain || d.get("domain")),
      ...memberDomains.map(m => m.domain)
    ]);
    const domainList = Array.from(domainSet);

    // Fetch owner info for each domain
    const domainsWithOwner = await Promise.all(domainList.map(async (domain) => {
      const owner = await getDomainOwner(domain);
      return {
        domain,
        owner: owner ? { id: owner.id, email: owner.email, merchant_name: owner.merchant_name } : null
      };
    }));

    return res.json({ success: true, data: { domains: domainsWithOwner } });
  } catch (err) {
    console.error("Fetch user domains error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch user domains" });
  }
});

// Get DNS record statistics (viewer/editor/admin)
app.get("/domains/:domain/stats", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const stats = await DNSRecord.findAll({
      where: { domain: req.params.domain },
      attributes: [
        "type",
        [DNSRecord.sequelize.fn("COUNT", DNSRecord.sequelize.col("id")), "count"],
      ],
      group: ["type"],
    });

    const totalRecords = await DNSRecord.count({
      where: { domain: req.params.domain },
    });

    const activeRecords = await DNSRecord.count({
      where: { domain: req.params.domain, isActive: true },
    });

    return res.json({
      success: true,
      data: {
        totalRecords,
        activeRecords,
        inactiveRecords: totalRecords - activeRecords,
        recordsByType: stats.reduce((acc, stat) => {
          acc[stat.type] = parseInt(stat.dataValues.count);
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    console.error("Get DNS stats error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch DNS statistics",
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
  }
});

// Get records by domain with advanced filtering (viewer/editor/admin)
app.get("/domains/:domain", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const {
      page = 1,
      limit = 10,
      type,
      name,
      sortBy = "createdAt",
      sortOrder = "DESC",
      isActive,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const whereClause = { domain: req.params.domain };
    if (type) whereClause.type = type.toUpperCase();
    if (name) whereClause.name = { [Op.like]: `%${name}%` };
    if (isActive !== undefined) whereClause.isActive = isActive === "true";

    // Validate sort parameters
    const validSortFields = ["createdAt", "updatedAt", "name", "type", "ttl"];
    const validSortOrders = ["ASC", "DESC"];

    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

    const records = await DNSRecord.findAndCountAll({
      where: whereClause,
      limit: Math.min(parseInt(limit), 100),
      offset,
      order: [[safeSortBy, safeSortOrder]],
      attributes: [
        "id", "domain", "type", "name", "value", "ttl", "priority", "comment", "isActive", "createdAt", "updatedAt"
      ],
    });

    return res.json({
      success: true,
      data: {
        records: records.rows,
        pagination: {
          total: records.count,
          page: parseInt(page),
          pages: Math.ceil(records.count / parseInt(limit)),
          limit: parseInt(limit),
        },
      },
    });
  } catch (err) {
    console.error("Fetch DNS records error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch DNS records",
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
  }
});

// Get single DNS record (viewer/editor/admin)
app.get("/domains/:domain/:id", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const record = await DNSRecord.findOne({
      where: { id: req.params.id, domain: req.params.domain },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "DNS record not found",
      });
    }

    return res.json({
      success: true,
      data: record,
    });
  } catch (err) {
    console.error("Fetch DNS record error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch DNS record",
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
  }
});

// Update record (editor/admin)
app.put("/domains/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type, name, value, ttl, priority, comment, userId,
      weight, port, target, primary, admin, serial, refresh, retry, expire, minimum,
      flags, tag
    } = req.body;

    // ...access checks...

    if (!type || !name) {
      return res.status(400).json({ success: false, message: "Missing required fields: type, name" });
    }
    const validTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV", "PTR", "CAA"];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({ success: false, message: `Invalid DNS record type. Supported types: ${validTypes.join(", ")}` });
    }
    if (["A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR"].includes(type.toUpperCase())) {
      if (!value) return res.status(400).json({ success: false, message: `Value required for ${type} record` });
      if (!validateRecordValue(type, value, name)) return res.status(400).json({ success: false, message: `Invalid value for ${type} record` });
    }
    let recordValue = value;
    // SRV validation
    if (type.toUpperCase() === "SRV") {
      const numPriority = Number(priority);
      const numWeight = Number(weight);
      const numPort = Number(port);
      if (
        [numPriority, numWeight, numPort].some(v => v === undefined || v === "" || isNaN(v)) ||
        !target || target === "" ||
        !isValidSRV({ priority: numPriority, weight: numWeight, port: numPort, target })
      ) {
        return res.status(400).json({ success: false, message: "SRV record requires numeric priority, weight, port, and valid target" });
      }
      recordValue = `${numPriority} ${numWeight} ${numPort} ${target}`;
    }
    // SOA validation
    if (type.toUpperCase() === "SOA") {
      const numSerial = Number(serial);
      const numRefresh = Number(refresh);
      const numRetry = Number(retry);
      const numExpire = Number(expire);
      const numMinimum = Number(minimum);
      if (
        [primary, admin].some(v => v === undefined || v === "") ||
        [numSerial, numRefresh, numRetry, numExpire, numMinimum].some(v => v === undefined || v === "" || isNaN(v)) ||
        !isValidSOA({ primary, admin, serial: numSerial, refresh: numRefresh, retry: numRetry, expire: numExpire, minimum: numMinimum })
      ) {
        return res.status(400).json({ success: false, message: "SOA record requires primary, admin, serial, refresh, retry, expire, minimum" });
      }
      recordValue = `${primary} ${admin} ${numSerial} ${numRefresh} ${numRetry} ${numExpire} ${numMinimum}`;
    }
    // CAA validation
    if (type.toUpperCase() === "CAA") {
      const numFlags = Number(flags);
      if (
        [numFlags, tag, value].some(v => v === undefined || v === "" || (typeof v === "number" && isNaN(v))) ||
        !isValidCAA({ flags: numFlags, tag, value })
      ) {
        return res.status(400).json({ success: false, message: "CAA record requires numeric flags, tag, and value" });
      }
      recordValue = `${numFlags} ${tag} ${value}`;
    }
    // Validate TTL
    if (!validateTTL(ttl)) {
      return res.status(400).json({ success: false, message: "TTL must be between 60 and 86400 seconds" });
    }
    // Validate priority for MX
    if (type.toUpperCase() === "MX") {
      if (priority === undefined || !validatePriority(priority)) {
        return res.status(400).json({ success: false, message: "Valid priority (0-65535) required for MX records" });
      }
    }

    const record = await DNSRecord.findByPk(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    await record.update({
      type: type.toUpperCase(),
      name,
      value: recordValue,
      ttl: parseInt(ttl),
      priority: priority ? parseInt(priority) : null,
      comment: comment || null,
      updatedAt: new Date(),
    });

    // Audit log for update
    await AuditLog.create({
      userId: req.user.userID,
      action: "UPDATE",
      entityType: "DNSRecord",
      entityId: record.id,
      domain: record.domain,
      details: { before: oldRecord, after: record.toJSON() },
      timestamp: new Date(),
    });

    return res.json({
      success: true,
      message: "DNS record updated successfully",
      data: record,
    });
  } catch (err) {
    console.error("Update DNS record error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update DNS record",
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
  }
});

// Bulk update records (editor/admin)
app.put("/domains/bulk/:domain", verifyToken, async (req, res) => {
  try {
    const hasAccess = await checkDomainAccess(req.user.userID, req.params.domain, "editor");
    if (!req.user.is_admin && !hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to bulk update DNS records for this domain",
      });
    }

    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Records array is required",
      });
    }

    const results = [];

    for (const recordData of records) {
      try {
        const record = await DNSRecord.findByPk(recordData.id);
        if (record && record.domain === req.params.domain) {
          Object.assign(record, recordData);
          record.updatedAt = new Date();
          await record.save();
          results.push({ id: record.id, success: true });
        } else {
          results.push({
            id: recordData.id,
            success: false,
            error: "Record not found",
          });
        }
      } catch (err) {
        results.push({ id: recordData.id, success: false, error: err.message });
      }
    }

    return res.json({
      success: true,
      message: "Bulk update completed",
      data: results,
    });
  } catch (err) {
    console.error("Bulk update DNS records error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update DNS records",
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
  }
});

// Delete record (editor/admin)
app.delete("/domains/:id", verifyToken, async (req, res) => {
  try {
    const record = await DNSRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "DNS record not found",
      });
    }
    const hasAccess = await checkDomainAccess(req.user.userID, record.domain, "editor");
    if (!req.user.is_admin && !hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete DNS records for this domain",
      });
    }

    const deletedRecord = { ...record.toJSON() };
    await record.destroy();

    // Audit log for delete
    await AuditLog.create({
      userId: req.user.userID,
      action: "DELETE",
      entityType: "DNSRecord",
      entityId: deletedRecord.id,
      domain: deletedRecord.domain,
      details: deletedRecord,
      timestamp: new Date(),
    });

    return res.json({
      success: true,
      message: "DNS record deleted successfully",
    });
  } catch (err) {
    console.error("Delete DNS record error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete DNS record",
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
  }
});

// Bulk delete records (editor/admin)
app.delete("/domains/bulk/:domain", verifyToken, async (req, res) => {
  try {
    const hasAccess = await checkDomainAccess(req.user.userID, req.params.domain, "editor");
    if (!req.user.is_admin && !hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to bulk delete DNS records for this domain",
      });
    }

    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Record IDs array is required",
      });
    }

    const recordsToDelete = await DNSRecord.findAll({
      where: { id: { [Op.in]: ids }, domain: req.params.domain },
    });
    for (const rec of recordsToDelete) {
      await AuditLog.create({
        userId: req.user.userID,
        action: "DELETE",
        entityType: "DNSRecord",
        entityId: rec.id,
        domain: rec.domain,
        details: rec.toJSON(),
        timestamp: new Date(),
      });
    }

    const deleted = await DNSRecord.destroy({
      where: {
        id: { [Op.in]: ids },
        domain: req.params.domain,
      },
    });

    return res.json({
      success: true,
      message: `${deleted} DNS records deleted successfully`,
      data: { deletedCount: deleted },
    });
  } catch (err) {
    console.error("Bulk delete DNS records error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete DNS records",
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
  }
});

// Get name servers for a domain (viewer/editor/admin)
app.get("/zones/:domain/nameservers", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const zone = await Zone.findOne({ where: { domain: req.params.domain } });
    if (!zone) {
      return res.status(404).json({ success: false, message: "Zone not found" });
    }
    return res.json({ success: true, data: { nameServers: zone.nameServers } });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch name servers" });
  }
});

// Update name servers for a domain (admin only)
// app.put("/zones/:domain/nameservers", verifyToken, async (req, res) => {
//   try {
//     const hasAccess = await checkDomainAccess(req.user.userID, req.params.domain, "admin");
//     if (!req.user.is_admin && !hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "You do not have permission to update name servers for this domain",
//       });
//     }
//     const { nameServers } = req.body;
//     if (!Array.isArray(nameServers) || nameServers.length < 1) {
//       return res.status(400).json({ success: false, message: "Invalid name servers" });
//     }
//     const zone = await Zone.findOne({ where: { domain: req.params.domain } });
//     if (!zone) {
//       return res.status(404).json({ success: false, message: "Zone not found" });
//     }
//     zone.nameServers = nameServers;
//     await zone.save();
//     return res.json({
//       success: true,
//       message: "Name servers updated",
//       data: { nameServers },
//     });
//   } catch (err) {
//     return res.status(500).json({ success: false, message: "Failed to update name servers" });
//   }
// });

// Get zone details for a domain (viewer/editor/admin)
app.get("/zones/:domain", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const zone = await Zone.findOne({ where: { domain: req.params.domain } });
    if (!zone) {
      return res.status(404).json({ success: false, message: "Zone not found" });
    }
    return res.json({ success: true, data: zone });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch zone" });
  }
});

// Get audit logs for a domain (viewer/editor/admin)
app.get("/auditlog/:domain", verifyToken, async (req, res) => {
  try {
    const canView = await canViewDomain(req.user.userID, req.params.domain);
    if (!canView && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const logs = await AuditLog.findAll({
      where: { domain: req.params.domain },
      order: [["timestamp", "DESC"]],
      limit: 100,
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch audit logs" });
  }
});

// Invite a team member (admin only)
app.post("/team/invite", verifyToken, async (req, res) => {
  const { domain, email, role } = req.body;
  const hasAccess = await checkDomainAccess(req.user.userID, domain, "admin");
  if (!req.user.is_admin && !hasAccess) {
    return res.status(403).json({ success: false, message: "You do not have permission to invite team members for this domain" });
  }
  if (!domain || !email || !role) return res.status(400).json({ success: false, message: "Missing fields" });
  const user = await User.findOne({ where: { email } });
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const existing = await DomainMember.findOne({ where: { domain, userId: user.id } });
  if (existing) return res.status(400).json({ success: false, message: "User already a member" });
  await DomainMember.create({
    domain,
    userId: user.id,
    role,
    invitedBy: req.user.userID,
    status: "pending"
  });
  return res.json({ success: true, message: "Invitation sent" });
});

// Get all pending invites for the logged-in user
app.get("/team/invites", verifyToken, async (req, res) => {
  try {
    const invites = await DomainMember.findAll({
      where: { userId: req.user.userID, status: "pending" },
      include: [{ model: User, as: "Inviter", attributes: ["email", "merchant_name"], foreignKey: "invitedBy" }]
    });
    res.json({ success: true, data: invites });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch invites" });
  }
});

// Accept invitation
app.post("/team/accept", verifyToken, async (req, res) => {
  const { domain } = req.body;
  const member = await DomainMember.findOne({ where: { domain, userId: req.user.userID, status: "pending" } });
  if (!member) return res.status(404).json({ success: false, message: "Invitation not found" });
  member.status = "active";
  await member.save();
  return res.json({ success: true, message: "Invitation accepted" });
});

// List team members for a domain (admin only)
app.get("/team/:domain", verifyToken, async (req, res) => {
  const hasAccess = await checkDomainAccess(req.user.userID, req.params.domain, "admin");
  if (!req.user.is_admin && !hasAccess) {
    return res.status(403).json({ success: false, message: "You do not have permission to view team members for this domain" });
  }
  console.log("Fetching members for domain:", req.params.domain);
  const members = await DomainMember.findAll({
    where: { domain: req.params.domain },
    include: [{ model: User, attributes: ["id", "email", "merchant_name"] }]
  });
  console.log("Members found:", members)
  return res.json({ success: true, data: members });
});

// Remove a team member (admin only)
app.delete("/team/:domain/:userId", verifyToken, async (req, res) => {
  const hasAccess = await checkDomainAccess(req.user.userID, req.params.domain, "admin");
  if (!req.user.is_admin && !hasAccess) {
    return res.status(403).json({ success: false, message: "You do not have permission to remove team members for this domain" });
  }
  const { domain, userId } = req.params;
  const member = await DomainMember.findOne({ where: { domain, userId } });
  if (!member) return res.status(404).json({ success: false, message: "Member not found" });
  await member.destroy();
  return res.json({ success: true, message: "Member removed" });
});

// Change member role (admin only)
app.put("/team/:domain/:userId", verifyToken, async (req, res) => {
  const hasAccess = await checkDomainAccess(req.user.userID, req.params.domain, "admin");
  if (!req.user.is_admin && !hasAccess) {
    return res.status(403).json({ success: false, message: "You do not have permission to change team member roles for this domain" });
  }
  const { domain, userId } = req.params;
  const { role } = req.body;
  const member = await DomainMember.findOne({ where: { domain, userId } });
  if (!member) return res.status(404).json({ success: false, message: "Member not found" });
  member.role = role;
  await member.save();
  return res.json({ success: true, message: "Role updated" });
});


