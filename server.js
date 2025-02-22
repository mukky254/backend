require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const cloudinary = require('cloudinary').v2;
const app = express();
const port = process.env.PORT || 3000;

// CORS setup - Allow multiple origins
const allowedOrigins = [
  "https://mukky254.github.io/IBM/",
  "https://mukky254.github.io/life/",
  "http://127.0.0.1:5500",
  "https://backend-2-i1oi.onrender.com",
  "http://127.0.0.1:5500/public/index.html",
];

app.use(cors({
  origin: function (origin, callback) {
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

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// File upload setup using multer (no need for diskStorage now)
const upload = multer({
  limits: { fileSize: 500 * 1024 * 1024 }, // 50 MB limit
  fileFilter: (req, file, cb) => {
    cb(null, true); // Accept all file types
  },
});

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

// Upload file handler (using Cloudinary)
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // Upload the file to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'auto', // auto-detect image/video
    });

    // Save the Cloudinary URL to PostgreSQL
    const post = await pool.query(
      "INSERT INTO posts (url, type, likes, comments) VALUES ($1, $2, 0, 0) RETURNING *",
      [result.secure_url, req.file.mimetype.startsWith("image") ? "image" : "video"]
    );

    res.status(201).json({ message: "File uploaded successfully", post: post.rows[0] });
  } catch (err) {
    console.error("Error uploading file to Cloudinary:", err);
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
  const { text } = req.body;

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
