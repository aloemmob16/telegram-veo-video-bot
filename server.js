const express = require("express");
const { Telegraf } = require("telegraf");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { GoogleGenerativeAI } = require("@google/genai");

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // domain kamu di Render

const bot = new Telegraf(BOT_TOKEN);

// Simpan data sementara per chat
const userSessions = new Map();

// Konfigurasi multer untuk upload image
const upload = multer({ dest: "uploads/" });

// ==== ROUTE TEST SERVER ====
app.get("/", (req, res) => {
  res.send("🚀 Telegram Veo Bot Aktif!");
});

// ==== BOT COMMANDS ====
bot.start((ctx) => {
  ctx.reply(
    "🎬 Selamat datang di Veo Video Bot!\n\n" +
      "1️⃣ Ketik /apikey untuk set API key Google Skill Boost\n" +
      "2️⃣ Ketik /settings untuk pilih model, rasio, resolusi, sound\n" +
      "3️⃣ Ketik /image untuk kirim gambar referensi\n" +
      "4️⃣ Ketik /generate untuk buat video"
  );
});

// Simpan API key
bot.command("apikey", (ctx) => {
  ctx.reply("🔑 Kirim API key Anda:");
  bot.once("text", (msgCtx) => {
    const key = msgCtx.message.text.trim();
    if (!key.startsWith("AIza") && key.length < 20) {
      return msgCtx.reply("❌ API key tidak valid.");
    }
    userSessions.set(ctx.chat.id, {
      apiKey: key,
      model: "veo-2",
      aspectRatio: "16:9",
      resolution: "720p",
      sound: false,
      imagePath: null,
    });
    msgCtx.reply("✅ API key disimpan. Lanjut ke /settings");
  });
});

// Pilih settings
bot.command("settings", (ctx) => {
  const session = userSessions.get(ctx.chat.id);
  if (!session) return ctx.reply("❌ Belum ada API key. Ketik /apikey dulu.");

  ctx.reply(
    "⚙️ Setting default:\n" +
      `Model: ${session.model}\n` +
      `Aspect Ratio: ${session.aspectRatio}\n` +
      `Resolusi: ${session.resolution}\n` +
      `Sound: ${session.sound ? "On" : "Off"}\n\n` +
      "Kirim format:\nmodel=<veo-2/veo-3>, ratio=<16:9/9:16>, res=<720p/1080p>, sound=<on/off>"
  );

  bot.once("text", (msgCtx) => {
    const text = msgCtx.message.text;
    const updates = text.split(",").map((s) => s.trim().toLowerCase());
    updates.forEach((u) => {
      if (u.startsWith("model=")) session.model = u.replace("model=", "");
      if (u.startsWith("ratio=")) session.aspectRatio = u.replace("ratio=", "");
      if (u.startsWith("res=")) session.resolution = u.replace("res=", "");
      if (u.startsWith("sound="))
        session.sound = u.replace("sound=", "") === "on";
    });
    ctx.reply("✅ Setting berhasil diupdate.");
  });
});

// Upload image referensi
bot.command("image", (ctx) => {
  ctx.reply("📷 Kirim gambar referensi (jpg/png).");
  bot.once("photo", async (msgCtx) => {
    const photo = msgCtx.message.photo.pop();
    const fileId = photo.file_id;
    const link = await ctx.telegram.getFileLink(fileId);
    const filePath = `uploads/${ctx.chat.id}_${Date.now()}.jpg`;

    const res = await fetch(link.href);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));

    const session = userSessions.get(ctx.chat.id);
    if (session) session.imagePath = filePath;

    ctx.reply("✅ Gambar referensi tersimpan.");
  });
});

// Generate video
bot.command("generate", (ctx) => {
  const session = userSessions.get(ctx.chat.id);
  if (!session || !session.apiKey) {
    return ctx.reply("❌ Belum ada API key. Ketik /apikey dulu.");
  }
  ctx.reply("📝 Kirim prompt video:");

  bot.once("text", async (msgCtx) => {
    const prompt = msgCtx.message.text.trim();
    ctx.reply("⏳ Sedang generate video...");

    try {
      const genAI = new GoogleGenerativeAI(session.apiKey);
      const videoModel = genAI.getGenerativeModel({
        model: session.model,
      });

      const input = {
        prompt,
        aspectRatio: session.aspectRatio,
        resolution: session.resolution,
        sound: session.sound,
      };

      // Jika ada image
      if (session.imagePath) {
        const imageData = fs.readFileSync(session.imagePath);
        input.image = {
          inlineData: {
            data: Buffer.from(imageData).toString("base64"),
            mimeType: "image/jpeg",
          },
        };
      }

      // Panggil API (asumsi SDK support generateVideo)
      const job = await videoModel.generateVideo(input);

      // Polling status
      let status = await videoModel.getJob(job.id);
      while (status.state === "PENDING" || status.state === "RUNNING") {
        await new Promise((r) => setTimeout(r, 5000));
        status = await videoModel.getJob(job.id);
      }

      if (status.state === "SUCCEEDED") {
        const videoUrl = status.result.videos[0].uri;
        await ctx.replyWithVideo({ url: videoUrl }, { caption: "✅ Video selesai!" });
      } else {
        ctx.reply("❌ Gagal generate video.");
      }
    } catch (err) {
      console.error(err);
      ctx.reply("⚠️ Error saat generate video.");
    }
  });
});

// Jalankan bot
bot.launch();
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
