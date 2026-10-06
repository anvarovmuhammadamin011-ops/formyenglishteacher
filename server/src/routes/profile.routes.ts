import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { h, ok, ApiError } from "../lib/errors";
import { authenticate } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const AVATARS_DIR = path.join(process.cwd(), "storage", "uploads", "avatars");
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(ApiError.badRequest("Only JPEG, PNG, WebP or GIF images are allowed (max 2 MB)."));
  },
});

export const profileRouter = Router();
profileRouter.use(authenticate);

profileRouter.post(
  "/avatar",
  upload.single("avatar"),
  h(async (req, res) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest("Attach an image as multipart field 'avatar'.");

    const ext = ALLOWED[file.mimetype];
    const name = `${req.user!.id}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const finalPath = path.join(AVATARS_DIR, name);
    await fs.promises.writeFile(finalPath, file.buffer);

    const previous = req.user!.avatarUrl;
    const url = `/uploads/avatars/${name}`;
    await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: url } });

    if (previous?.startsWith("/uploads/avatars/")) {
      const oldName = path.basename(previous);
      if (oldName.includes(req.user!.id)) {
        fs.promises.unlink(path.join(AVATARS_DIR, oldName)).catch(() => undefined);
      }
    }

    return ok(res, { avatarUrl: url });
  }),
);

profileRouter.delete(
  "/avatar",
  h(async (req, res) => {
    const previous = req.user!.avatarUrl;
    await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: null } });
    if (previous?.startsWith("/uploads/avatars/")) {
      const oldName = path.basename(previous);
      if (oldName.includes(req.user!.id)) {
        fs.promises.unlink(path.join(AVATARS_DIR, oldName)).catch(() => undefined);
      }
    }
    return ok(res, { avatarUrl: null });
  }),
);
