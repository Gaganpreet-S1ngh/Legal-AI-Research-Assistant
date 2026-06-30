import multer from "multer";

const allowedImageTypes = [
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/png",
    "image/webp",
    "application/pdf"
];

// Filter
const fileFilter = (req, file, cb) => {
    if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type"), false);
    }
};

// Configure multer for file uploads (memory storage) //ram
export const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 10MB limit
    },
});
