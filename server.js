require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;  // Use port from environment variable or default to 3000

// CORS setup - Allow multiple origins
const allowedOrigins = [   // This might also be used
  "https://mukky254.github.io/IBM/", 
  "https://mukky254.github.io/life/",
  "http://127.0.0.1:5500",
];

app.use(cors({
  origin: function (origin, callback) {
    // If the origin is in the allowedOrigins array or is undefined (for localhost), allow it
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));

// Database setup using environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// File storage setup using multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Save the uploaded files to the 'uploads' folder
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}${fileExtension}`); // Name the file with timestamp to avoid overwriting
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // Limit file size to 50 MB (adjust as needed)
  fileFilter: (req, file, cb) => {
    // Allow all file types
    cb(null, true); // Skip file type check
  },
});

app.use("/uploads", express.static(uploadDir));  // Serve uploaded files statically
app.use(express.static("public"));  // Serve static files (if any)
app.use(express.json());  // Middleware for parsing JSON bodies

// Get posts from the database
app.get("/api/posts", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM posts ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Upload file handler
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype.startsWith("image") ? "image" : "video"; // You can add more logic here if you want to distinguish the file types.

  try {
    await pool.query(
      "INSERT INTO posts (url, type, likes, comments) VALUES ($1, $2, 0, 0)",
      [fileUrl, fileType]
    );
    res.json({ message: "File uploaded successfully", url: fileUrl });
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// Like a post
app.post("/api/posts/:id/like", async (req, res) => {
  const postId = req.params.id;

  try {
    const result = await pool.query(
      "UPDATE posts SET likes = likes + 1 WHERE id = $1 RETURNING likes",
      [postId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json({ likes: result.rows[0].likes });
  } catch (err) {
    console.error("Error liking post:", err);
    res.status(500).json({ error: "Failed to like post" });
  }
});

// Comment on a post
app.post("/api/posts/:id/comment", async (req, res) => {
  const postId = req.params.id;
  const { text } = req.body;  // Get the comment text from the request body

  if (!text) {
    return res.status(400).json({ error: "Comment text is required" });
  }

  try {
    // Insert the comment into the comments table
    await pool.query(
      "INSERT INTO comments (post_id, text) VALUES ($1, $2)",
      [postId, text]
    );

    // Update the comment count in the posts table
    const result = await pool.query(
      "UPDATE posts SET comments = comments + 1 WHERE id = $1 RETURNING comments",
      [postId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json({ comments: result.rows[0].comments });
  } catch (err) {
    console.error("Error commenting on post:", err);
    res.status(500).json({ error: "Failed to comment on post" });
  }
});

// Fetch comments for a post
app.get("/api/posts/:id/comments", async (req, res) => {
  const postId = req.params.id;

  try {
    const result = await pool.query(
      "SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at DESC",
      [postId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// Global error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
