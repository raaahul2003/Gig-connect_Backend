
const multer = require("multer");
const path = require("path");

// Store uploaded files temporarily in memory.
// The controller will upload them to Cloudinary.
const storage = multer.memoryStorage();

// Allowed file extensions
const allowedTypes = [
  ".pdf",
  ".doc",
  ".docx",
  ".zip",
  ".png",
  ".jpg",
  ".jpeg",
  ".txt",
  ".xlsx",
  ".pptx",
];

// Validate file extension
const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
});

module.exports = upload;
