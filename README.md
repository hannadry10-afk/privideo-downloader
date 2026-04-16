<div align="center">

<p align="center">
  <img src="https://i.imgur.com/placeholder-logo.png" alt="Incognito Zone" width="120" height="120" style="border-radius: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
</p>

# 🎬 Incognito Zone

**Fast, Private & Free Video Downloader**

Download videos from YouTube, TikTok, Instagram, Twitter, Facebook and 1000+ sites — no signup required, 100% private.

[![Live Site](https://img.shields.io/badge/Live-🟢-brightgreen?style=for-the-badge)](https://incognito-zone.xyz)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/hannadry10-afk/privideo-downloader?style=social)](https://github.com/hannadry10-afk/privideo-downloader/stargazers)

---

### ✨ Key Features

| | | |
|:---:|:---:|:---:|
| 🔗 **Multi-Platform** | ⚡ **Lightning Fast** | 🔒 **Privacy First** |
| YouTube, TikTok, Instagram, Twitter, Facebook & more | Powered by edge functions for optimal speed | No tracking, no logs, no data stored |
| 🌍 **1000+ Sites** | 🎬 **HD Quality** | 📱 **Mobile Ready** |
| Support for over 1000 video platforms | Download up to 4K resolution | Fully responsive design |

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/hannadry10-afk/privideo-downloader.git
cd privideo-downloader

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to start downloading!

---

## 🛠 Tech Stack

<div align="center">

| | | | |
|:---:|:---:|:---:|:---:|
| <img src="https://skillicons.dev/icons?i=react" height="32"><br>**React** | <img src="https://skillicons.dev/icons?i=typescript" height="32"><br>**TypeScript** | <img src="https://skillicons.dev/icons?i=vite" height="32"><br>**Vite** | <img src="https://skillicons.dev/icons?i=tailwindcss" height="32"><br>**Tailwind** |
| <img src="https://skillicons.dev/icons?i=supabase" height="32"><br>**Supabase** | <img src="https://skillicons.dev/icons?i=vercel" height="32"><br>**Vercel** | <img src="https://skillicons.dev/icons?i=deno" height="32"><br>**Deno** | <img src="https://skillicons.dev/icons?i=shadcnui" height="32"><br>**shadcn/ui** |

</div>

---

## 📁 Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── FetchLogger.tsx  # Real-time fetch logs
│   ├── UrlInput.tsx     # URL input component
│   ├── VideoPreview.tsx # Video preview player
│   ├── VideoSkeleton.tsx# Loading skeleton
│   └── ui/              # shadcn/ui components
├── integrations/
│   └── supabase/        # Supabase client
├── pages/
│   ├── Index.tsx        # Home/Downloader page
│   ├── WatchPage.tsx    # Video preview page
│   ├── PrivacyPolicy.tsx
│   ├── TermsOfService.tsx
│   └── NotFound.tsx
└── main.tsx
```

---

## ☁️ Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel --prod
```

### Environment Variables

Required for Supabase integration:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID |

---

## 🔐 Security

- ✅ Environment variables for all secrets
- ✅ `.env` tracked in `.gitignore`
- ✅ Zero dependency vulnerabilities
- ✅ Edge function execution for privacy
- ✅ No user data storage

Found a bug? [Open an issue](https://github.com/hannadry10-afk/privideo-downloader/issues)

---

## 🤝 Contributing

```bash
# Fork & clone
git clone https://github.com/YOUR_USERNAME/privideo-downloader.git

# Create feature branch
git checkout -b feature/amazing-feature

# Commit & push
git commit -m 'feat: add amazing feature'
git push origin feature/amazing-feature

# Open Pull Request
```

---

## 📜 License

Licensed under the [MIT License](LICENSE) — © 2024 Incognito Zone

---

<div align="center">

**[🌐 Live Site](https://incognito-zone.xyz)** • **[🐛 Report Bug](https://github.com/hannadry10-afk/privideo-downloader/issues)** • **[⭐ Star Us](https://github.com/hannadry10-afk/privideo-downloader/stargazers)**

Made with ☕ & ❤️

</div>
