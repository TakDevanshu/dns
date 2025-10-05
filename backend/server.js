const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const  sequelize  = require("./config");
const { User, DNSRecord } = require("./models");

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

      app.listen(PORT, () => console.log(`?? Server running on port ${PORT}`));
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
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

connectWithRetry();

// Cors setup
const allowedOrigins = [
  "http://localhost:5173",    
  "http://172.232.121.87"       
];

app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true); 
    if(allowedOrigins.indexOf(origin) === -1){
      const msg = "The CORS policy for this site does not allow access from the specified Origin.";
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true  // if using cookies or auth headers
}));

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
    console.log("User info in token:", decoded.userID);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Expired or invalid token" });
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
    console.log("Parameters Missing")
    return res.status(400).json({ message: "Parameters Missing" });
  }

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      console.log("Already a User")
      return res.status(400).json({ message: "Already a User" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      merchant_name,
      email,
      password: hashedPassword,
    });

    console.log("User Registered Successfully")

    return res
      .status(200)
      .json({
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
    console.log("Email and Password required")
    return res.status(400).json({ message: "Email and Password required" });
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
        console.log("Invalid Credentials")
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        console.log("Invalid Password")
      return res.status(400).json({ message: "Invalid Password" });
    }

    const token = jwt.sign({ userID: user.id, is_admin: user.is_admin }, JWT_SECRET, {
      expiresIn: "4h",
    });

    console.log("Login Successful")
    return res.status(200).json({ message: "Login Successful", token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server Error", err: err.message });
  }
});

//Dns record api

const isValidIPv4 = (ip) => {
  const regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return regex.test(ip);
};

const isValidIPv6 = (ip) => {
  const regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  return regex.test(ip) || /^(?:[0-9a-fA-F]{1,4}:)*::[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*$/.test(ip);
};

const isValidDomain = (domain) => {
  const regex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  return regex.test(domain) && domain.length <= 253;
};

const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

// DNS record type validation
const validateRecordValue = (type, value, name = '') => {
  switch (type.toUpperCase()) {
    case 'A':
      return isValidIPv4(value);
    case 'AAAA':
      return isValidIPv6(value);
    case 'CNAME':
    case 'NS':
      return isValidDomain(value);
    case 'MX':
      return isValidDomain(value);
    case 'TXT':
      return value.length <= 255; // TXT records have length limits
    case 'SOA':
      // SOA format: primary-ns email serial refresh retry expire minimum
      const soaParts = value.split(' ');
      return soaParts.length >= 7 && isValidDomain(soaParts[0]) && isValidEmail(soaParts[1].replace('@', '.'));
    case 'SRV':
      // SRV format: priority weight port target
      const srvParts = value.split(' ');
      return srvParts.length === 4 && 
             !isNaN(srvParts[0]) && !isNaN(srvParts[1]) && 
             !isNaN(srvParts[2]) && isValidDomain(srvParts[3]);
    case 'PTR':
      return isValidDomain(value);
    case 'CAA':
      // CAA format: flags tag value
      const caaParts = value.split(' ');
      return caaParts.length >= 3;
    default:
      return true; // Allow other record types
  }
};

const validateTTL = (ttl) => {
  const numTTL = parseInt(ttl);
  return !isNaN(numTTL) && numTTL >= 60 && numTTL <= 86400; // 1 minute to 24 hours
};

const validatePriority = (priority) => {
  const numPriority = parseInt(priority);
  return !isNaN(numPriority) && numPriority >= 0 && numPriority <= 65535;
};

// Create DNS record (admin only)
app.post("/domains/create", verifyToken, async (req, res) => {
  try {
    console.log(req.user)
    if (!req.user.is_admin) {
      return res.status(403).json({ 
        success: false, 
        message: "Admin privileges required" 
      });
    }

    const { domain, type, name, value, ttl = 3600, priority, userId, comment } = req.body;

    // Validate required fields
    if (!domain || !type || !name || !value || !userId) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: domain, type, name, value, userId" 
      });
    }

    // Validate domain
    if (!isValidDomain(domain)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid domain format" 
      });
    }

    // Validate DNS record type
    const validTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'PTR', 'CAA'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid DNS record type. Supported types: ${validTypes.join(', ')}` 
      });
    }

    // Validate record value based on type
    if (!validateRecordValue(type, value, name)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid value for ${type} record` 
      });
    }

    // Validate TTL
    if (!validateTTL(ttl)) {
      return res.status(400).json({ 
        success: false, 
        message: "TTL must be between 60 and 86400 seconds" 
      });
    }

    // Validate priority for MX and SRV records
    if (['MX', 'SRV'].includes(type.toUpperCase())) {
      if (priority === undefined || !validatePriority(priority)) {
        return res.status(400).json({ 
          success: false, 
          message: "Valid priority (0-65535) required for MX/SRV records" 
        });
      }
    }

    // Check for duplicate records
    const existingRecord = await DNSRecord.findOne({
      where: {
        domain,
        type: type.toUpperCase(),
        name,
        userId
      }
    });

    if (existingRecord && ['A', 'AAAA', 'CNAME'].includes(type.toUpperCase())) {
      return res.status(409).json({ 
        success: false, 
        message: "A record with this name already exists for this domain" 
      });
    }

    // CNAME validation - cannot coexist with other record types
    if (type.toUpperCase() === 'CNAME') {
      const conflictingRecords = await DNSRecord.findOne({
        where: {
          domain,
          name,
          type: { [Op.ne]: 'CNAME' },
          userId
        }
      });

      if (conflictingRecords) {
        return res.status(409).json({ 
          success: false, 
          message: "CNAME records cannot coexist with other record types for the same name" 
        });
      }
    }

    const record = await DNSRecord.create({ 
      domain, 
      type: type.toUpperCase(), 
      name, 
      value, 
      ttl: parseInt(ttl), 
      priority: priority ? parseInt(priority) : null, 
      userId,
      comment: comment || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return res.status(201).json({ 
      success: true,
      message: "DNS record created successfully", 
      data: record 
    });

  } catch (err) {
    console.error('Create DNS record error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to create DNS record", 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Get all unique domains for a user
app.get("/domains/user/:userId", verifyToken, async (req, res) => {
  try {
    // Only allow users to fetch their own domains (or admin)
    if (parseInt(req.params.userId) !== req.user.userID && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const domains = await DNSRecord.findAll({
      where: { userId: req.params.userId },
      attributes: [
        [DNSRecord.sequelize.fn('DISTINCT', DNSRecord.sequelize.col('domain')), 'domain']
      ],
      order: [["domain", "ASC"]]
    });
    const domainList = domains.map(d => d.domain || d.get('domain'));
    return res.json({ success: true, data: { domains: domainList } });
  } catch (err) {
    console.error('Fetch user domains error:', err);
    return res.status(500).json({ success: false, message: "Failed to fetch user domains" });
  }
});

// Get DNS record statistics
app.get("/domains/:domain/stats", verifyToken, async (req, res) => {
  try {
    const stats = await DNSRecord.findAll({
      where: {
        domain: req.params.domain,
        userId: req.user.userID
      },
      attributes: [
        'type',
        [DNSRecord.sequelize.fn('COUNT', DNSRecord.sequelize.col('id')), 'count']
      ],
      group: ['type']
    });

    const totalRecords = await DNSRecord.count({
      where: {
        domain: req.params.domain,
        userId: req.user.userID
      }
    });

    const activeRecords = await DNSRecord.count({
      where: {
        domain: req.params.domain,
        userId: req.user.userID,
        isActive: true
      }
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
        }, {})
      }
    });

  } catch (err) {
    console.error('Get DNS stats error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to fetch DNS statistics", 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Get records by domain with advanced filtering
app.get("/domains/:domain", verifyToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      type, 
      name, 
      sortBy = 'createdAt', 
      sortOrder = 'DESC',
      isActive 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build where clause
    const whereClause = {
      domain: req.params.domain,
      userId: req.user.userID
    };

    if (type) whereClause.type = type.toUpperCase();
    if (name) whereClause.name = { [Op.like]: `%${name}%` };
    if (isActive !== undefined) whereClause.isActive = isActive === 'true';

    // Validate sort parameters
    const validSortFields = ['createdAt', 'updatedAt', 'name', 'type', 'ttl'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const records = await DNSRecord.findAndCountAll({
      where: whereClause,
      limit: Math.min(parseInt(limit), 100), // Max 100 records per page
      offset,
      order: [[safeSortBy, safeSortOrder]],
      attributes: ['id', 'domain', 'type', 'name', 'value', 'ttl', 'priority', 'comment', 'isActive', 'createdAt', 'updatedAt']
    });

    return res.json({
      success: true,
      data: {
        records: records.rows,
        pagination: {
          total: records.count,
          page: parseInt(page),
          pages: Math.ceil(records.count / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });

  } catch (err) {
    console.error('Fetch DNS records error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to fetch DNS records", 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Get single DNS record
app.get("/domains/:domain/:id", verifyToken, async (req, res) => {
  try {
    const record = await DNSRecord.findOne({
      where: {
        id: req.params.id,
        domain: req.params.domain,
        userId: req.user.userID
      }
    });

    if (!record) {
      return res.status(404).json({ 
        success: false,
        message: "DNS record not found" 
      });
    }

    return res.json({
      success: true,
      data: record
    });

  } catch (err) {
    console.error('Fetch DNS record error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to fetch DNS record", 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Update record (admin only)
app.put("/domains/:id", verifyToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ 
        success: false,
        message: "Admin privileges required" 
      });
    }

    const { name, value, ttl, priority, comment, isActive } = req.body;

    const record = await DNSRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ 
        success: false,
        message: "DNS record not found" 
      });
    }

    // Validate updates
    if (value && !validateRecordValue(record.type, value, name || record.name)) {
      return res.status(400).json({ 
        success: false,
        message: `Invalid value for ${record.type} record` 
      });
    }

    if (ttl && !validateTTL(ttl)) {
      return res.status(400).json({ 
        success: false,
        message: "TTL must be between 60 and 86400 seconds" 
      });
    }

    if (priority !== undefined && ['MX', 'SRV'].includes(record.type) && !validatePriority(priority)) {
      return res.status(400).json({ 
        success: false,
        message: "Priority must be between 0 and 65535" 
      });
    }

    // Update fields
    if (name) record.name = name;
    if (value) record.value = value;
    if (ttl) record.ttl = parseInt(ttl);
    if (priority !== undefined) record.priority = parseInt(priority);
    if (comment !== undefined) record.comment = comment;
    if (isActive !== undefined) record.isActive = isActive;
    
    record.updatedAt = new Date();

    await record.save();

    return res.json({ 
      success: true,
      message: "DNS record updated successfully", 
      data: record 
    });

  } catch (err) {
    console.error('Update DNS record error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to update DNS record", 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Bulk update records (admin only)
app.put("/domains/bulk/:domain", verifyToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ 
        success: false,
        message: "Admin privileges required" 
      });
    }

    const { records } = req.body;
    
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "Records array is required" 
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
          results.push({ id: recordData.id, success: false, error: 'Record not found' });
        }
      } catch (err) {
        results.push({ id: recordData.id, success: false, error: err.message });
      }
    }

    return res.json({
      success: true,
      message: "Bulk update completed",
      data: results
    });

  } catch (err) {
    console.error('Bulk update DNS records error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to update DNS records", 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Delete record (admin only)
app.delete("/domains/:id", verifyToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ 
        success: false,
        message: "Admin privileges required" 
      });
    }

    const record = await DNSRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ 
        success: false,
        message: "DNS record not found" 
      });
    }

    await record.destroy();

    return res.json({ 
      success: true,
      message: "DNS record deleted successfully" 
    });

  } catch (err) {
    console.error('Delete DNS record error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to delete DNS record", 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Bulk delete records (admin only)
app.delete("/domains/bulk/:domain", verifyToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ 
        success: false,
        message: "Admin privileges required" 
      });
    }

    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "Record IDs array is required" 
      });
    }

    const deleted = await DNSRecord.destroy({ 
      where: { 
        id: { [Op.in]: ids },
        domain: req.params.domain 
      } 
    });

    return res.json({ 
      success: true,
      message: `${deleted} DNS records deleted successfully`,
      data: { deletedCount: deleted }
    });

  } catch (err) {
    console.error('Bulk delete DNS records error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to delete DNS records", 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});



