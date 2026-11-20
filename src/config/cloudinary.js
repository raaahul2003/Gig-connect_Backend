
const cloudinary = require("cloudinary").v2;

const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure storage for freelancer profile photos
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "gigconnect/profile-photos",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      {
        width: 500,
        height: 500,
        crop: "limit",
        quality: "auto",
        fetch_format: "auto",
      },
    ],
  },
});

module.exports = {
  cloudinary,
  storage,
};
