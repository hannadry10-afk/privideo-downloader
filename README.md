<div align="center">

# 🎬 Privideo Downloader

**A fast, privacy-first video downloader built with React & Supabase Edge Functions**

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Edge_Functions-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

[Features](#-features) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started) • [Project Structure](#-project-structure) • [Deployment](#-deployment) • [Contributing](#-contributing)

---

</div>

## ✨ Features

- 🔗 **Paste & Download** — Simply paste a video URL and fetch it instantly
- 👁️ **In-Browser Preview** — Watch the video directly before downloading
- 📋 **Fetch Logger** — Real-time log of fetch activity for transparency
- 🧩 **Multi-Format Support** — Handles MP4, WebM, HLS, DASH, MOV, MKV, AVI, and more
- ⚡ **Edge-Powered** — Video fetching runs on Supabase Edge Functions for speed and privacy
- 📱 **Responsive Design** — Works seamlessly on desktop and mobile
- 🔒 **Privacy First** — No tracking, no stored downloads, no user data retained
- 🌙 **Clean UI** — Built with shadcn/ui components and Tailwind CSS

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + TypeScript |
| **Build Tool** | Vite 7 |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Backend** | Supabase Edge Functions (Deno) |
| **Database/Auth** | Supabase |
| **Package Manager** | npm |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/) v9 or higher
- A [Supabase](https://supabase.com/) account

### 1. Clone the Repository

```bash
git clone https://github.com/hannadry10-afk/privideo-downloader.git
cd privideo-downloader
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example env file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
VITE_SUPABASE_PROJECT_ID=your-project-id
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
```

> ⚠️ **Never commit your `.env` file.** It is already in `.gitignore`.
> Get your credentials from your [Supabase project settings](https://supabase.com/dashboard/project/_/settings/api).

### 4. Start the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` with hot-reloading enabled.

---

## 📁 Project Structure

```
privideo-downloader/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── FetchLogger.tsx  # Real-time fetch activity log
│   │   ├── NavLink.tsx      # Navigation link component
│   │   ├── UrlInput.tsx     # URL input with validation
│   │   ├── VideoPreview.tsx # In-browser video player
│   │   ├── VideoSkeleton.tsx# Loading skeleton UI
│   │   └── ui/              # shadcn/ui base components
│   ├── integrations/
│   │   └── supabase/        # Supabase client & type definitions
│   ├── pages/
│   │   ├── Index.tsx        # Home / main downloader page
│   │   ├── WatchPage.tsx    # Video watch/preview page
│   │   ├── PrivacyPolicy.tsx
│   │   ├── TermsOfService.tsx
│   │   └── NotFound.tsx
│   └── main.tsx
├── supabase/
│   └── functions/
│       └── fetch-video/     # Deno Edge Function — video fetcher
├── .env.example             # Environment variable template
├── .gitignore
├── package.json
├── tailwind.config.ts
├── vite.config.ts
└── tsconfig.json
```

---

## 🧪 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local development server |
| `npm run build` | Build for production |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint checks |

---

## ☁️ Deployment

### Deploy via Lovable

The easiest way to deploy is through [Lovable](https://lovable.dev):

1. Open your Lovable project
2. Click **Share → Publish**
3. Your app is live instantly

### Deploy Supabase Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login and link your project
supabase login
supabase link --project-ref your-project-id

# Deploy the fetch-video function
supabase functions deploy fetch-video
```

### Custom Domain

To connect a custom domain, go to:
**Lovable Project → Settings → Domains → Connect Domain**

See the [custom domain docs](https://docs.lovable.dev/features/custom-domain) for details.

---

## 🔒 Security

This project follows security best practices:

- ✅ **No secrets in code** — All credentials loaded via environment variables
- ✅ **`.env` in `.gitignore`** — Sensitive files never committed
- ✅ **0 known vulnerabilities** — Dependencies audited with `npm audit`
- ✅ **Edge Functions** — Server-side video fetching keeps client safe
- ✅ **`.env.example`** — Safe template provided for onboarding

To report a security vulnerability, please open a [GitHub Issue](https://github.com/hannadry10-afk/privideo-downloader/issues) or contact the maintainer directly.

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/your-feature`
3. **Commit** your changes: `git commit -m 'feat: add your feature'`
4. **Push** to the branch: `git push origin feature/your-feature`
5. **Open** a Pull Request

Please make sure to:
- Follow the existing code style
- Run `npm run lint` before submitting
- Keep PRs focused and well-described

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ using [React](https://reactjs.org/), [Supabase](https://supabase.com/), and [Lovable](https://lovable.dev/)

⭐ Star this repo if you found it useful!

</div>
