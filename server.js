require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);

const express = require("express");
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;
const cors = require("cors");
const session = require("express-session");

const app = express();
const uri = "mongodb+srv://alfiankalani_db_user:manajemeninfobio@mib-uts.e3tztgr.mongodb.net/?appName=mib-uts";
const client = new MongoClient(uri);

// Middleware to parse JSON and serve HTML files
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(session({
  secret: "medcore-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 }  // session lasts 1 hour
}));

// ── Middleware: protect admin routes ──
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ── Login ──
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "mib333") {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Username atau password salah" });
  }
});

// ── Logout ──
app.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ── Check session ──
app.get("/me", (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ── GET data (public — guests can see charts) ──
app.get("/data", async (req, res) => {
  try {
    const data = await client.db("test").collection("database").find({}).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── INSERT data (admin only) ──
app.post("/insert", requireAdmin, async (req, res) => {
  try {
    const result = await client.db("test").collection("database").insertOne(req.body);
    res.json({ success: true, id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ────────────────────────────────────────────────────
app.put('/update/:id', requireAdmin, async (req, res) => {
    try {
        // const db = client.db('medcore');
 
        // Remove _id from the body — MongoDB does not allow updating
        // the _id field and will throw an immutable field error if present
        const { _id, ...updateData } = req.body;
 
        const result = await client.db("test").collection("database").updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// // ── DELETE data (admin only) ──
// app.post("/delete", requireAdmin, async (req, res) => {
//   try {
//     const { index } = req.body;
//     const all = await client.db("test").collection("database").find({}).toArray();
//     if (index < 0 || index >= all.length) return res.status(400).json({ error: "Invalid index" });
//     await client.db("test").collection("database").deleteOne({ _id: all[index]._id });
//     res.json({ success: true });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// ── DELETE data (admin only) ──
app.delete("/delete/:id", requireAdmin, async (req, res) => {
  try {
    const result = await client.db("test").collection("database").deleteOne(
      { _id: new ObjectId(req.params.id) }
    );
    if (result.deletedCount === 0) return res.status(404).json({ error: "Document not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function connectDB() {
  await client.connect();
  console.log("Connected to MongoDB");
}
connectDB();

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
